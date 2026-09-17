import AsyncStorage from '@react-native-async-storage/async-storage';
import { addToHistory, emptyLibrary, HISTORY_LIMIT, LIBRARY_STORAGE_KEY, loadLibrary, saveLibrary, toggleFavorite, type TranslationEntry } from '../library';

export const entry: TranslationEntry = {
  id: 'saved-1', createdAt: '2026-09-17T08:00:00.000Z',
  request: { text: 'Спасибо', sourceLanguage: 'ru', targetLanguage: 'th', mode: 'thai-formal', speakerGender: 'female' },
  result: { translation: 'ขอบคุณค่ะ', thaiText: 'ขอบคุณค่ะ', requestId: 'request-1', pronunciation: { latin: 'khop khun', russian: 'кхоп кхун', words: [{ latin: 'khun', russian: 'кхун', englishTranslation: 'you', russianTranslation: 'вас' }] } },
};

beforeEach(() => {
  jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined);
});

it('loads empty, malformed and partially invalid data safely', async () => {
  expect(await loadLibrary()).toEqual(emptyLibrary());
  for (const raw of ['{', 'null', '{}', '{"history":2}']) {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(raw);
    expect(await loadLibrary()).toEqual(emptyLibrary());
  }
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify({ history: [null, {}, entry, entry, { ...entry, id: 'bad', createdAt: 'bad' }], favorites: [entry] }));
  expect(await loadLibrary()).toEqual({ history: [entry], favorites: [entry] });
});

it('retains favorites independently of history retention and unstars without deleting history', () => {
  let library = toggleFavorite(addToHistory(emptyLibrary(), entry), entry);
  for (let i = 0; i < HISTORY_LIMIT; i++) library = addToHistory(library, { ...entry, id: String(i) });
  expect(library.history).toHaveLength(HISTORY_LIMIT);
  expect(library.history.find((item) => item.id === entry.id)).toBeUndefined();
  expect(library.favorites).toEqual([entry]);
  expect(toggleFavorite(library, entry)).toEqual({ history: library.history, favorites: [] });
});

it('roundtrips complete request and result snapshots', async () => {
  const library = toggleFavorite(addToHistory(emptyLibrary(), entry), entry);
  await saveLibrary(library);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(library));
  expect(await loadLibrary()).toEqual(library);
});

it('propagates read failures and continues the write queue after failure', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read'));
  await expect(loadLibrary()).rejects.toThrow('read');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('quota'));
  await expect(saveLibrary(emptyLibrary())).rejects.toThrow('quota');
  await expect(saveLibrary(addToHistory(emptyLibrary(), entry))).resolves.toBeUndefined();
});

it('serializes writes so rapid star changes cannot overwrite newer state', async () => {
  let finish!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const first = saveLibrary(emptyLibrary());
  const second = saveLibrary(addToHistory(emptyLibrary(), entry));
  await Promise.resolve();
  await Promise.resolve();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([first, second]);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(LIBRARY_STORAGE_KEY, JSON.stringify(addToHistory(emptyLibrary(), entry)));
});
