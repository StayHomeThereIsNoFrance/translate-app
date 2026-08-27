import { z } from 'zod';

export const MAX_TRANSLATION_LENGTH = 2000;

export const LanguageSchema = z.enum(['ru', 'th']);
export const TranslationModeSchema = z.enum(['farang-ploy', 'thai-formal']);
export const SpeakerGenderSchema = z.enum(['male', 'female']);

export type Language = z.infer<typeof LanguageSchema>;
export type TranslationMode = z.infer<typeof TranslationModeSchema>;
export type SpeakerGender = z.infer<typeof SpeakerGenderSchema>;

export const TranslationRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_TRANSLATION_LENGTH),
    sourceLanguage: LanguageSchema,
    targetLanguage: LanguageSchema,
    mode: TranslationModeSchema,
    speakerGender: SpeakerGenderSchema,
  })
  .refine((value) => value.sourceLanguage !== value.targetLanguage, {
    message: 'Source and target languages must be different',
    path: ['targetLanguage'],
  });

export type TranslationRequest = z.infer<typeof TranslationRequestSchema>;

export const PronunciationWordSchema = z.object({
  latin: z.string().trim().min(1),
  russian: z.string().trim().min(1),
  englishTranslation: z.string().trim().min(1),
  russianTranslation: z.string().trim().min(1),
});

export type PronunciationWord = z.infer<typeof PronunciationWordSchema>;

const PronunciationWordsSchema = z.array(PronunciationWordSchema).min(1);

export const TranslationResultSchema = z.object({
  translation: z.string().trim().min(1),
  thaiText: z.string().trim().min(1),
  pronunciation: z.object({
    latin: z.string().trim().min(1),
    russian: z.string().trim().min(1),
    words: PronunciationWordsSchema,
  }),
  requestId: z.string().min(1),
});

export type TranslationResult = z.infer<typeof TranslationResultSchema>;

export const ModelTranslationSchema = z.object({
  translation: z.string().trim().min(1),
  thaiText: z.string().trim().min(1),
  pronunciationWords: PronunciationWordsSchema,
});

export type ModelTranslation = z.infer<typeof ModelTranslationSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const TRANSLATION_MODES: ReadonlyArray<{
  id: TranslationMode;
  label: string;
  description: string;
}> = [
  {
    id: 'farang-ploy',
    label: 'Farang - Ploy',
    description: 'Живое неформальное общение',
  },
  {
    id: 'thai-formal',
    label: 'Thai formal',
    description: 'Уважительный нейтральный стиль',
  },
] as const;

export const SPEAKER_GENDERS: ReadonlyArray<{
  id: SpeakerGender;
  label: string;
}> = [
  { id: 'male', label: 'Мужчина' },
  { id: 'female', label: 'Женщина' },
] as const;
