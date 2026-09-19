import { dirname, resolve } from 'node:path';
import { LibrarySyncRequestSchema } from '@thai-translate/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AccountStore, hash, secret, SESSION_SECONDS, type LoginAttempt } from './account-store.js';
import type { AppConfig } from './config.js';
import { googleIdentity, type GoogleIdentity } from './google-auth.js';

const cookieName = 'thai_session';
const StartSchema = z.object({ platform: z.enum(['web', 'native']), challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const ExchangeSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), verifier: z.string().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/) });

function tokenFrom(request: FastifyRequest): string {
  const bearer = request.headers.authorization;
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
  return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
}
function error(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: { code: 'ACCOUNT_ERROR', message } });
}

export async function registerAccountRoutes(app: FastifyInstance, config: AppConfig, identity: GoogleIdentity = googleIdentity(config)) {
  const store = new AccountStore(config.authDatabasePath ?? (config.translationCachePath === ':memory:' ? ':memory:' : resolve(dirname(config.translationCachePath), 'accounts.sqlite')));
  app.addHook('onClose', async () => store.close());
  const origin = config.authPublicUrl ?? 'https://translate.hetz.autismstaking.xyz';
  const available = Boolean(config.googleClientId && config.googleClientSecret);
  const cookie = (token: string, age: number) => `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
  const finishUrl = (attempt: LoginAttempt, key: string, value: string) => attempt.platform === 'native'
    ? `thaitranslate://auth/callback?${key}=${encodeURIComponent(value)}`
    : `${origin}/#${key}=${encodeURIComponent(value)}`;

  await app.register(async (routes) => {
    routes.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
      if (request.method === 'POST' && request.headers.origin && request.headers.origin !== origin) {
        return error(reply, 403, 'Недопустимый источник запроса');
      }
    });
    routes.get('/api/auth/session', async (request) => ({ available, user: store.user(tokenFrom(request)) }));
    routes.post('/api/auth/start', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!available) return error(reply, 503, 'Вход через Google пока не настроен на сервере');
      const parsed = StartSchema.safeParse(request.body);
      if (!parsed.success) return error(reply, 400, 'Не удалось начать вход');
      const attempt: LoginAttempt = { ...parsed.data, nonce: secret(), googleVerifier: secret() };
      const state = store.startLogin(attempt);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.googleClientId!, redirect_uri: `${origin}/api/auth/google/callback`,
        response_type: 'code', scope: 'openid email profile', prompt: 'select_account',
        state, nonce: attempt.nonce, code_challenge: hash(attempt.googleVerifier), code_challenge_method: 'S256',
      }).toString();
      return { url: url.toString() };
    });
    routes.get('/api/auth/google/callback', async (request, reply) => {
      const parsed = z.object({ state: z.string().max(128), code: z.string().max(4096).optional(), error: z.string().max(200).optional() }).safeParse(request.query);
      if (!parsed.success) return error(reply, 400, 'Ссылка входа недействительна. Начните вход снова.');
      const attempt = store.takeLogin(parsed.data.state);
      if (!attempt) return error(reply, 400, 'Время входа истекло. Начните вход снова.');
      if (!parsed.data.code || parsed.data.error) return reply.redirect(finishUrl(attempt, 'auth_error', 'cancelled'));
      try {
        const user = await identity(parsed.data.code, attempt.googleVerifier, attempt.nonce);
        const code = store.handoff(user, attempt);
        return reply.redirect(finishUrl(attempt, 'auth_code', code));
      } catch {
        return reply.redirect(finishUrl(attempt, 'auth_error', 'failed'));
      }
    });
    routes.post('/api/auth/exchange', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      const parsed = ExchangeSchema.safeParse(request.body);
      if (!parsed.success) return error(reply, 400, 'Неверные данные входа');
      const session = store.exchange(parsed.data.code, parsed.data.verifier);
      if (!session) return error(reply, 401, 'Ссылка входа истекла. Войдите снова.');
      if (session.platform === 'web') reply.header('Set-Cookie', cookie(session.token, SESSION_SECONDS));
      return { user: session.user, ...(session.platform === 'native' ? { token: session.token } : {}) };
    });
    routes.post('/api/auth/logout', async (request, reply) => {
      store.logout(tokenFrom(request));
      reply.header('Set-Cookie', cookie('', 0));
      return { ok: true };
    });
    routes.post('/api/v1/library/sync', {
      bodyLimit: 4 * 1024 * 1024,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      const user = store.user(tokenFrom(request));
      if (!user) return error(reply, 401, 'Сессия истекла. Войдите через Google снова.');
      const parsed = LibrarySyncRequestSchema.safeParse(request.body);
      if (!parsed.success) return error(reply, 400, 'Не удалось прочитать изменения переводов');
      if (parsed.data.userId !== user.id) return error(reply, 409, 'Аккаунт изменился. Перезагрузите приложение.');
      return store.sync(user.id, parsed.data.operations);
    });
  });
}
