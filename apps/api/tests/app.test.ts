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
  pronunciationWords: [
    {
      latin: 'khop',
      russian: 'кхоп',
      englishTranslation: 'thank',
      russianTranslation: 'благодарить',
    },
    {
      latin: 'khun',
      russian: 'кхун',
      englishTranslation: 'you',
      russianTranslation: 'вас',
    },
    {
      latin: 'khrap',
      russian: 'кхрап',
      englishTranslation: 'polite particle',
      russianTranslation: 'вежливая частица',
    },
  ],
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
        words: result.pronunciationWords,
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
