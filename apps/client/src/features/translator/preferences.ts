import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LanguageSchema,
  SpeakerGenderSchema,
  TranslationModeSchema,
  type Language,
  type SpeakerGender,
  type TranslationMode,
} from '@thai-translate/contracts';

const STORAGE_KEY = 'thai-translate-preferences-v1';

export type TranslatorPreferences = {
  mode: TranslationMode;
  showWordTranslations: boolean;
  speakerGender: SpeakerGender;
  sourceLanguage: Language;
};

export const defaultPreferences: TranslatorPreferences = {
  mode: 'farang-ploy',
  showWordTranslations: true,
  speakerGender: 'male',
  sourceLanguage: 'ru',
};

export async function loadPreferences(): Promise<TranslatorPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPreferences;
    }
    const decoded = JSON.parse(raw) as Record<string, unknown>;
    if (
      decoded.showWordTranslations !== undefined &&
      typeof decoded.showWordTranslations !== 'boolean'
    ) {
      return defaultPreferences;
    }
    return {
      mode: TranslationModeSchema.parse(decoded.mode),
      showWordTranslations: decoded.showWordTranslations ?? true,
      speakerGender: SpeakerGenderSchema.parse(decoded.speakerGender),
      sourceLanguage: LanguageSchema.parse(decoded.sourceLanguage),
    };
  } catch {
    return defaultPreferences;
  }
}

export async function savePreferences(
  preferences: TranslatorPreferences,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
