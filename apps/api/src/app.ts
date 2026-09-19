import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import {
  TranslationRequestSchema,
  type ModelTranslation,
} from '@thai-translate/contracts';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

import type { AppConfig } from './config.js';
import { registerAccountRoutes } from './account-routes.js';
import type { GoogleIdentity } from './google-auth.js';
import { PromptRepository } from './prompts.js';
import { CachedTranslationService } from './translation-cache.js';
import {
  TranslationProviderError,
  type TranslationService,
} from './translator.js';

type BuildAppOptions = {
  config: AppConfig;
  translator: TranslationService;
  logger?: boolean;
  identity?: GoogleIdentity;
};

function apiError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({
    error: { code, message },
    requestId: request.id,
  });
}

export async function buildApp({
  config,
  translator,
  identity,
  logger = config.nodeEnv !== 'test',
}: BuildAppOptions): Promise<FastifyInstance> {
  const cachedTranslator = new CachedTranslationService(
    translator,
    config.translationCachePath,
    JSON.stringify(['v1', config.cliproxyBaseUrl, config.model, config.reasoningEffort,
      new PromptRepository(config.promptsDir).cacheVersion]),
  );
  const app = Fastify({
    logger,
    disableRequestLogging: true,
    bodyLimit: 32 * 1024,
    trustProxy: true,
  });

  app.addHook('onClose', async () => cachedTranslator.close());

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'), false);
    },
  });
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
  });

  await registerAccountRoutes(app, config, identity);

  app.get('/healthz', async () => ({
    status: 'ok',
    model: config.model,
  }));

  app.post(
    '/api/v1/translate',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = TranslationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return apiError(
          reply,
          request,
          400,
          'INVALID_REQUEST',
          'Проверьте текст и направление перевода',
        );
      }

      try {
        const result: ModelTranslation = await cachedTranslator.translate(parsed.data);
        return {
          translation: result.translation,
          thaiText: result.thaiText,
          pronunciation: {
            latin: result.pronunciationWords
              .map((word) => word.latin)
              .join(' '),
            russian: result.pronunciationWords
              .map((word) => word.russian)
              .join(' '),
            words: result.pronunciationWords,
          },
          requestId: request.id,
        };
      } catch (error) {
        if (error instanceof TranslationProviderError) {
          request.log.warn(
            { providerCode: error.code },
            'Translation provider request failed',
          );
          return apiError(
            reply,
            request,
            error.statusCode,
            error.code.toUpperCase(),
            error.code === 'timeout'
              ? 'Перевод занял слишком много времени. Попробуйте ещё раз'
              : 'Не удалось получить перевод. Попробуйте ещё раз',
          );
        }
        request.log.error({ error }, 'Unexpected translation error');
        return apiError(
          reply,
          request,
          500,
          'INTERNAL_ERROR',
          'Внутренняя ошибка сервера',
        );
      }
    },
  );

  if (config.staticDir && existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: resolve(config.staticDir),
      prefix: '/',
      decorateReply: true,
    });
    app.get('/apk', async (_request, reply) =>
      reply
        .header('Content-Type', 'application/vnd.android.package-archive')
        .header(
          'Content-Disposition',
          'attachment; filename="thai-ai-translate.apk"',
        )
        .header('Cache-Control', 'no-store, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .sendFile('thai-ai-translate.apk', {
          cacheControl: false,
          etag: false,
          lastModified: false,
        }),
    );
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return apiError(reply, request, 404, 'NOT_FOUND', 'Маршрут не найден');
    });
  }

  return app;
}
