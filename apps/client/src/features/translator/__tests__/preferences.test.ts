import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from '../preferences';

describe('translator preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns defaults for missing or invalid storage', async () => {
    expect(await loadPreferences()).toEqual(defaultPreferences);
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{"mode":"bad"}');
    expect(await loadPreferences()).toEqual(defaultPreferences);
  });

  it('enables word translations for legacy preferences', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        mode: 'thai-formal',
        speakerGender: 'female',
        sourceLanguage: 'th',
      }),
    );
    await expect(loadPreferences()).resolves.toEqual({
      mode: 'thai-formal',
      showWordTranslations: true,
      speakerGender: 'female',
      sourceLanguage: 'th',
    });
  });

  it('loads a saved word translation setting', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        mode: 'farang-ploy',
        showWordTranslations: false,
        speakerGender: 'male',
        sourceLanguage: 'ru',
      }),
    );
    await expect(loadPreferences()).resolves.toMatchObject({
      showWordTranslations: false,
    });
  });

  it('stores valid preferences', async () => {
    await savePreferences({
      mode: 'thai-formal',
      showWordTranslations: false,
      speakerGender: 'female',
      sourceLanguage: 'th',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'thai-translate-preferences-v1',
      '{"mode":"thai-formal","showWordTranslations":false,"speakerGender":"female","sourceLanguage":"th"}',
    );
  });
});
