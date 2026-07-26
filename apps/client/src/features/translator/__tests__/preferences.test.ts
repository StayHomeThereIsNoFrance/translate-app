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

  it('stores valid preferences', async () => {
    await savePreferences({
      mode: 'thai-formal',
      speakerGender: 'female',
      sourceLanguage: 'th',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'thai-translate-preferences-v1',
      '{"mode":"thai-formal","speakerGender":"female","sourceLanguage":"th"}',
    );
  });
});
