import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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
import {
  TranslationProviderError,
  type TranslationService,
} from './translator.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: 'translator-user' };
    user: { sub: 'translator-user' };
  }
}

type BuildAppOptions = {
  config: AppConfig;
  translator: TranslationService;
  logger?: boolean;
};

function constantTimeMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

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
  logger = config.nodeEnv !== 'test',
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    bodyLimit: 32 * 1024,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.sessionSecret,
    cookie: {
      cookieName: 'thai_translate_session',
      signed: false,
    },
  });
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

  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    if (!config.accessPin) {
      return;
    }
    try {
      await request.jwtVerify();
    } catch {
      return apiError(reply, request, 401, 'AUTH_REQUIRED', 'Введите PIN для доступа');
    }
  }

  app.get('/healthz', async () => ({
    status: 'ok',
    model: config.model,
  }));

  app.post(
    '/api/v1/session',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!config.accessPin) {
        return { authRequired: false, token: null, expiresIn: 0 };
      }
      const body = request.body as { pin?: unknown };
      if (
        typeof body?.pin !== 'string' ||
        !constantTimeMatch(body.pin, config.accessPin)
      ) {
        return apiError(reply, request, 401, 'INVALID_PIN', 'Неверный PIN');
      }

      const token = await reply.jwtSign(
        { sub: 'translator-user' },
        { expiresIn: '30d' },
      );
      reply.setCookie('thai_translate_session', token, {
        path: '/',
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60,
      });
      return { authRequired: true, token, expiresIn: 30 * 24 * 60 * 60 };
    },
  );

  app.post(
    '/api/v1/translate',
    {
      preHandler: authenticate,
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
        const result: ModelTranslation = await translator.translate(parsed.data);
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
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return apiError(reply, request, 404, 'NOT_FOUND', 'Маршрут не найден');
    });
  }

  return app;
}
