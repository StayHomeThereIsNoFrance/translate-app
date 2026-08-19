import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSLATION_LENGTH,
  ModelTranslationSchema,
  TranslationResultSchema,
  TranslationRequestSchema,
} from '../src/index.js';

const pronunciationWords = [
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
];

describe('TranslationRequestSchema', () => {
  it('accepts a Russian to Thai request', () => {
    expect(
      TranslationRequestSchema.parse({
        text: 'Спасибо',
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'thai-formal',
        speakerGender: 'male',
      }),
    ).toMatchObject({ text: 'Спасибо', targetLanguage: 'th' });
  });

  it('rejects equal languages and oversized text', () => {
    expect(() =>
      TranslationRequestSchema.parse({
        text: 'x',
        sourceLanguage: 'ru',
        targetLanguage: 'ru',
        mode: 'farang-ploy',
        speakerGender: 'female',
      }),
    ).toThrow();

    expect(() =>
      TranslationRequestSchema.parse({
        text: 'x'.repeat(MAX_TRANSLATION_LENGTH + 1),
        sourceLanguage: 'ru',
        targetLanguage: 'th',
        mode: 'farang-ploy',
        speakerGender: 'male',
      }),
    ).toThrow();
  });
});

describe('ModelTranslationSchema', () => {
  it('accepts aligned pronunciation words with bilingual translations', () => {
    expect(
      ModelTranslationSchema.parse({
        translation: 'ขอบคุณครับ',
        thaiText: 'ขอบคุณครับ',
        pronunciationWords,
      }),
    ).toMatchObject({ pronunciationWords });
  });

  it('requires every pronunciation and translation field', () => {
    expect(() =>
      ModelTranslationSchema.parse({
        translation: 'ขอบคุณครับ',
        thaiText: 'ขอบคุณครับ',
        pronunciationWords: [
          {
            latin: 'khop',
            russian: 'кхоп',
            englishTranslation: 'thank',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('TranslationResultSchema', () => {
  it('requires the aligned words in the public pronunciation', () => {
    expect(
      TranslationResultSchema.parse({
        translation: 'ขอบคุณครับ',
        thaiText: 'ขอบคุณครับ',
        pronunciation: {
          latin: 'khop khun khrap',
          russian: 'кхоп кхун кхрап',
          words: pronunciationWords,
        },
        requestId: 'request-1',
      }),
    ).toMatchObject({ pronunciation: { words: pronunciationWords } });
  });
});
