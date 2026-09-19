import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import type { LibraryOperation, TranslationEntry } from '@thai-translate/contracts';
import { buildApp } from '../src/app.js';
import { AccountStore, hash, secret, SESSION_SECONDS } from '../src/account-store.js';
import { googleIdentity, verifyGoogleToken } from '../src/google-auth.js';
import { testConfig } from './helpers.js';

const user = { id: 'google-user-1', name: 'Test Person', email: 'test@example.com' };
const entry: TranslationEntry = { id: 'entry-1', createdAt: '2026-09-19T10:00:00.000Z', request: { text: 'Спасибо', sourceLanguage: 'ru', targetLanguage: 'th', mode: 'thai-formal', speakerGender: 'male' }, result: { translation: 'ขอบคุณครับ', thaiText: 'ขอบคุณครับ', requestId: 'req-1', pronunciation: { latin: 'khop khun', russian: 'кхоп кхун', words: [{ latin: 'khun', russian: 'кхун', englishTranslation: 'you', russianTranslation: 'вас' }] } } };
const op = (kind: LibraryOperation['kind'], favorite = false, record = entry): LibraryOperation => ({ id: randomUUID(), kind, entry: record, favorite, inHistory: true });
const attempt = () => ({ platform: 'native' as const, challenge: hash('a'.repeat(43)), nonce: secret(), googleVerifier: secret() });
const config = { ...testConfig, googleClientId: 'client', googleClientSecret: 'secret', authPublicUrl: 'https://translate.test', corsOrigins: ['https://translate.test', 'https://other.test'] };
const makeApp = (identity = vi.fn(async () => user), enabled = true) => buildApp({ config: enabled ? config : testConfig, translator: { translate: vi.fn() }, identity });

async function login(app: Awaited<ReturnType<typeof makeApp>>, platform = 'native') {
  const verifier = secret();
  const start = await app.inject({ method: 'POST', url: '/api/auth/start', payload: { platform, challenge: hash(verifier) } });
  expect(start.statusCode).toBe(200);
  const authorize = new URL(start.json().url);
  expect(authorize.origin).toBe('https://accounts.google.com');
  expect(authorize.searchParams.get('scope')).toBe('openid email profile');
  const callback = await app.inject({ url: `/api/auth/google/callback?state=${authorize.searchParams.get('state')}&code=google-code` });
  const finish = new URL(callback.headers.location!);
  const code = new URLSearchParams(finish.hash.slice(1) || finish.search).get('auth_code');
  const exchange = await app.inject({ method: 'POST', url: '/api/auth/exchange', payload: { code, verifier } });
  return { exchange, code, verifier, state: authorize.searchParams.get('state') };
}

describe('account routes', () => {
  it('logs in web/native, syncs devices, isolates users and revokes sessions', async () => {
    const identity = vi.fn(async () => user);
    const app = await makeApp(identity);
    try {
      const native = await login(app);
      expect(native.exchange.statusCode).toBe(200);
      const headers = { authorization: `Bearer ${native.exchange.json().token}` };
      const web = await login(app, 'web');
      expect(web.exchange.json().token).toBeUndefined();
      expect(web.exchange.headers['set-cookie']).toContain('HttpOnly; SameSite=Lax');
      expect(web.exchange.headers['set-cookie']).toContain('Secure');
      const cookie = String(web.exchange.headers['set-cookie']).split(';')[0];
      const sync = (operations: LibraryOperation[]) => app.inject({ method: 'POST', url: '/api/v1/library/sync', headers, payload: { userId: user.id, operations } });
      const star = op('favorite', true);
      expect((await sync([op('record'), star])).json().favorites).toHaveLength(1);
      const onWeb = await app.inject({ method: 'POST', url: '/api/v1/library/sync', headers: { cookie }, payload: { userId: user.id, operations: [] } });
      expect(onWeb.json().history[0].request.text).toBe('Спасибо');
      await app.inject({ method: 'POST', url: '/api/v1/library/sync', headers: { cookie }, payload: { userId: user.id, operations: [op('favorite')] } });
      expect((await sync([star])).json().favorites).toHaveLength(0);
      expect((await sync([op('import', true)])).json().favorites).toHaveLength(0);
      expect((await app.inject({ method: 'POST', url: '/api/v1/library/sync', headers, payload: { userId: 'other', operations: [] } })).statusCode).toBe(409);
      identity.mockResolvedValueOnce({ ...user, id: 'other' });
      const other = await login(app);
      const isolated = await app.inject({ method: 'POST', url: '/api/v1/library/sync', headers: { authorization: `Bearer ${other.exchange.json().token}` }, payload: { userId: 'other', operations: [] } });
      expect(isolated.json()).toEqual({ history: [], favorites: [] });
      expect((await app.inject({ url: '/api/auth/session', headers })).json().user.id).toBe(user.id);
      await app.inject({ method: 'POST', url: '/api/auth/logout', headers, payload: {} });
      expect((await sync([])).statusCode).toBe(401);
      expect((await app.inject({ url: '/api/auth/session', headers })).json().user).toBeNull();
    } finally { await app.close(); }
  });

  it('rejects malformed input, CSRF, forged callbacks and replays', async () => {
    const app = await makeApp();
    try {
      expect((await app.inject({ url: '/api/auth/google/callback' })).statusCode).toBe(400);
      expect((await app.inject({ url: '/api/auth/google/callback?state=forged&code=code' })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/auth/start', payload: { platform: 'native', challenge: 'bad' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/auth/exchange', payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/auth/exchange', payload: { code: secret(), verifier: secret() } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://other.test' }, payload: {} })).statusCode).toBe(403);
      const session = await login(app);
      expect((await app.inject({ url: `/api/auth/google/callback?state=${session.state}&code=code` })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/auth/exchange', payload: { code: session.code, verifier: session.verifier } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/v1/library/sync', headers: { authorization: `Bearer ${session.exchange.json().token}` }, payload: { operations: [{}] } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/v1/library/sync', payload: { operations: [] } })).statusCode).toBe(401);
    } finally { await app.close(); }
  });

  it('handles missing config, cancellation and failed Google validation', async () => {
    const disabled = await makeApp(undefined, false);
    expect((await disabled.inject({ url: '/api/auth/session' })).json().available).toBe(false);
    expect((await disabled.inject({ method: 'POST', url: '/api/auth/start', payload: {} })).statusCode).toBe(503);
    await disabled.close();
    const app = await makeApp(vi.fn(async () => { throw new Error('invalid signature'); }));
    try {
      for (const outcome of ['error=access_denied', 'code=invalid']) {
        const start = await app.inject({ method: 'POST', url: '/api/auth/start', payload: { platform: 'web', challenge: hash(secret()) } });
        const state = new URL(start.json().url).searchParams.get('state');
        const response = await app.inject({ url: `/api/auth/google/callback?state=${state}&${outcome}` });
        expect(response.headers.location).toContain('#auth_error=');
        expect(response.headers['cache-control']).toBe('no-store');
      }
    } finally { await app.close(); }
  });
});

it('persists, expires secrets, protects verifier and retains favorites', () => {
  const directory = mkdtempSync(join(tmpdir(), 'translate-accounts-'));
  let now = Date.now();
  let store = new AccountStore(join(directory, 'accounts.sqlite'), () => now);
  try {
    const data = attempt();
    const state = store.startLogin(data);
    expect(store.takeLogin(state)).toEqual(data);
    expect(store.takeLogin(state)).toBeNull();
    const expired = store.startLogin(data);
    now += 600001;
    expect(store.takeLogin(expired)).toBeNull();
    const code = store.handoff(user, data);
    expect(store.exchange(code, 'wrong')).toBeNull();
    const session = store.exchange(code, 'a'.repeat(43))!;
    const expiredCode = store.handoff(user, data);
    now += 120001;
    expect(store.exchange(expiredCode, 'a'.repeat(43))).toBeNull();
    const operations = [op('record'), op('favorite', true)];
    for (let i = 0; i < 205; i++) operations.push(op('record', false, { ...entry, id: `new-${i}`, createdAt: '2026-09-20T10:00:00.000Z' }));
    const saved = store.sync(user.id, operations);
    expect(saved.history).toHaveLength(200);
    expect(saved.favorites).toEqual([entry]);
    store.close();
    store = new AccountStore(join(directory, 'accounts.sqlite'), () => now);
    expect(store.user(session.token)).toEqual(user);
    expect(store.library(user.id)).toEqual(saved);
    now += SESSION_SECONDS * 1000;
    expect(store.user(session.token)).toBeNull();
    store.startLogin(data);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

it('checks Google signature, audience, issuer, expiry, nonce and email verification', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const payload = { sub: user.id, email: user.email, name: user.name, email_verified: true, nonce: 'nonce' };
  const sign = (changes = {}, issuer = 'https://accounts.google.com', aud = 'client', expiry = '5m') => new SignJWT({ ...payload, ...changes }).setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime(expiry).sign(privateKey);
  const key = async () => publicKey;
  expect(await verifyGoogleToken(await sign(), 'client', 'nonce', key)).toEqual(user);
  for (const token of [await sign({ nonce: 'wrong' }), await sign({ email_verified: false }), await sign({}, 'https://evil.test'), await sign({}, undefined, 'other'), await sign({}, undefined, undefined, '-1s')]) {
    await expect(verifyGoogleToken(token, 'client', 'nonce', key)).rejects.toThrow();
  }
  const other = await generateKeyPair('RS256');
  await expect(verifyGoogleToken(await sign(), 'client', 'nonce', async () => other.publicKey)).rejects.toThrow();
});

it('handles provider exchange errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 400 })) as typeof fetch;
    await expect(googleIdentity(config)('code', 'verifier', 'nonce')).rejects.toThrow('exchange failed');
    globalThis.fetch = vi.fn(async () => new Response('{}')) as typeof fetch;
    await expect(googleIdentity(config)('code', 'verifier', 'nonce')).rejects.toThrow('identity missing');
  } finally { globalThis.fetch = original; }
});
