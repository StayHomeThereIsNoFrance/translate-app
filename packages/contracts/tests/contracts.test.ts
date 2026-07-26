import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSLATION_LENGTH,
  ModelTranslationSchema,
  TranslationRequestSchema,
} from '../src/index.js';

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
  it('requires all pronunciation fields', () => {
    expect(() =>
      ModelTranslationSchema.parse({
        translation: 'ขอบคุณครับ',
        thaiText: 'ขอบคุณครับ',
        pronunciationLatin: 'khop khun khrap',
      }),
    ).toThrow();
  });
});
