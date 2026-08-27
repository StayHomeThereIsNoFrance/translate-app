import type { TranslationRequest } from '@thai-translate/contracts';
import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { PromptRepository } from '../src/prompts.js';
import {
  CliproxyTranslationService,
  TranslationProviderError,
} from '../src/translator.js';
import { testConfig } from './helpers.js';

const request: TranslationRequest = {
  text: 'Спасибо',
  sourceLanguage: 'ru',
  targetLanguage: 'th',
  mode: 'thai-formal',
  speakerGender: 'male',
};

const validOutput = JSON.stringify({
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
});

function serviceWith(responseOrError: unknown) {
  const create = vi.fn(async () => {
    if (responseOrError instanceof Error || responseOrError === 'not an error') {
      throw responseOrError;
    }
    return responseOrError;
  });
  const service = new CliproxyTranslationService(
    testConfig,
    new PromptRepository(testConfig.promptsDir),
    { responses: { create } } as unknown as Pick<OpenAI, 'responses'>,
  );
  return { create, service };
}

describe('CliproxyTranslationService', () => {
  it('requests strict structured output and validates it', async () => {
    const { create, service } = serviceWith({
      output_text: validOutput,
      output: [],
    });

    await expect(service.translate(request)).resolves.toMatchObject({
      translation: 'ขอบคุณครับ',
      pronunciationWords: expect.arrayContaining([
        expect.objectContaining({
          latin: 'khop',
          russianTranslation: 'благодарить',
        }),
      ]),
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-terra',
        store: false,
        input: 'Спасибо',
        text: {
          format: expect.objectContaining({
            type: 'json_schema',
            strict: true,
          }),
        },
      }),
    );
  });

  it('preserves the original Thai writing for Thai to Russian', async () => {
    const { service } = serviceWith({
      output_text: validOutput,
      output: [],
    });
    await expect(
      service.translate({
        ...request,
        text: '  ขอบคุณค่ะ  ',
        sourceLanguage: 'th',
        targetLanguage: 'ru',
        speakerGender: 'female',
      }),
    ).resolves.toMatchObject({ thaiText: 'ขอบคุณค่ะ' });
  });

  it.each([
    [
      { output_text: '{broken', output: [] },
      'invalid_response',
      'invalid JSON',
    ],
    [
      { output_text: JSON.stringify({ translation: 'only one field' }), output: [] },
      'invalid_response',
      'did not match',
    ],
    [
      {
        output_text: '',
        output: [
          {
            type: 'message',
            content: [{ type: 'refusal', refusal: 'Cannot translate this' }],
          },
        ],
      },
      'refusal',
      'Cannot translate this',
    ],
    [
      { output_text: '', output: [] },
      'invalid_response',
      'returned no text',
    ],
  ])('maps malformed provider result %#', async (providerResponse, code, message) => {
    const { service } = serviceWith(providerResponse);
    await expect(service.translate(request)).rejects.toMatchObject({
      code,
      message: expect.stringContaining(message),
    });
  });

  it('preserves known provider errors and hides unknown ones behind upstream', async () => {
    const known = new TranslationProviderError('known', 'timeout', 504);
    await expect(serviceWith(known).service.translate(request)).rejects.toBe(known);

    await expect(
      serviceWith(new Error('connection failed')).service.translate(request),
    ).rejects.toMatchObject({
      code: 'upstream',
      statusCode: 502,
      message: 'connection failed',
    });

    await expect(serviceWith('not an error').service.translate(request)).rejects
      .toMatchObject({
        code: 'upstream',
        message: 'Unknown upstream error',
      });
  });
});
