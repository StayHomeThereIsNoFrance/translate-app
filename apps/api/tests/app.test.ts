import type {
  ModelTranslation,
  TranslationRequest,
} from '@thai-translate/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { TranslationService } from '../src/translator.js';
import { TranslationProviderError } from '../src/translator.js';
import { testConfig } from './helpers.js';

const result: ModelTranslation = {
  translation: 'ขอบคุณครับ',
  thaiText: 'ขอบคุณครับ',
  pronunciationLatin: 'khop khun khrap',
  pronunciationRussian: 'кхоп кхун кхрап',
};

afterEach(() => vi.restoreAllMocks());

describe('translation API', () => {
  it('reports health without contacting the provider', async () => {
    const translate = vi.fn();
    const app = await buildApp({
      config: testConfig,
      translator: { translate } as TranslationService,
      logger: false,
    });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      model: 'gpt-5.6-terra',
    });
    expect(translate).not.toHaveBeenCalled();
    await app.close();
  });

  it('translates a valid phrase and returns the public contract', async () => {
    const translate = vi.fn(async (_request: TranslationRequest) => result);
    const app = await buildApp({
      config: testConfig,
      translator: { translate },
      logger: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/translate',
      payload: {
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      translation: 'ขอบคุณครับ',
      thaiText: 'ขอบคุณครับ',
      pronunciation: {
        latin: 'khop khun khrap',
        russian: 'кхоп кхун кхрап',
      },
    });
    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'thai-formal', speakerGender: 'male' }),
    );
    await app.close();
  });

  it('rejects invalid directions before calling the provider', async () => {
    const translate = vi.fn();
    const app = await buildApp({
      config: testConfig,
      translator: { translate } as TranslationService,
      logger: false,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/translate',
      payload: {
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'ru',
        mode: 'thai-formal',
        speakerGender: 'male',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(translate).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps provider timeouts to a safe public error', async () => {
    const app = await buildApp({
      config: testConfig,
      translator: {
        translate: async () => {
          throw new TranslationProviderError('secret upstream detail', 'timeout', 504);
        },
      },
      logger: false,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/translate',
      payload: {
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      },
    });
    expect(response.statusCode).toBe(504);
    expect(response.body).not.toContain('secret upstream detail');
    await app.close();
  });

  it('maps other provider and unexpected failures to safe errors', async () => {
    for (const [failure, statusCode, code] of [
      [new TranslationProviderError('private', 'upstream', 502), 502, 'UPSTREAM'],
      [new Error('private'), 500, 'INTERNAL_ERROR'],
    ] as const) {
      const app = await buildApp({
        config: testConfig,
        translator: {
          translate: async () => {
            throw failure;
          },
        },
        logger: false,
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/translate',
        payload: {
          text: 'Спасибо',
          sourceLanguage: 'ru',
          targetLanguage: 'th',
          mode: 'thai-formal',
          speakerGender: 'male',
        },
      });
      expect(response.statusCode).toBe(statusCode);
      expect(response.json().error.code).toBe(code);
      expect(response.body).not.toContain('private');
      await app.close();
    }
  });
});

describe('session API', () => {
  it('disables authentication when no production PIN is configured', async () => {
    const app = await buildApp({
      config: testConfig,
      translator: { translate: async () => result },
      logger: false,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authRequired: false,
      token: null,
      expiresIn: 0,
    });
    await app.close();
  });

  it('requires the configured PIN and accepts a bearer token', async () => {
    const app = await buildApp({
      config: { ...testConfig, accessPin: '2468' },
      translator: { translate: async () => result },
      logger: false,
    });

    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { pin: '0000' },
    });
    expect(denied.statusCode).toBe(401);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: {},
    });
    expect(missing.statusCode).toBe(401);

    const unauthenticatedTranslation = await app.inject({
      method: 'POST',
      url: '/api/v1/translate',
      payload: {
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      },
    });
    expect(unauthenticatedTranslation.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { pin: '2468' },
    });
    const token = login.json().token as string;
    expect(token).toBeTruthy();

    const translated = await app.inject({
      method: 'POST',
      url: '/api/v1/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      },
    });
    expect(translated.statusCode).toBe(200);
    await app.close();
  });
});
