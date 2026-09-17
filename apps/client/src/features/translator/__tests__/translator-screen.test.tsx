import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';

import { TranslatorScreen } from '../translator-screen';
import { LIBRARY_STORAGE_KEY } from '../library';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as typeof fetch;

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

describe('TranslatorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        translation: 'ขอบคุณครับ',
        thaiText: 'ขอบคุณครับ',
        pronunciation: {
          latin: 'khop khun khrap',
          russian: 'кхоп кхун кхрап',
          words: pronunciationWords,
        },
        requestId: 'test-request',
      }),
    });
  });

  it('renders the required controls and empty state', async () => {
    render(<TranslatorScreen />);
    expect(screen.getByText('Farang - Ploy')).toBeTruthy();
    expect(screen.getByText('Thai formal')).toBeTruthy();
    expect(screen.getByText('Мужчина')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('Тайский')).toBeTruthy();
    expect(screen.getByText('Перевод появится здесь')).toBeTruthy();
    expect(screen.getByTestId('settings-button')).toBeTruthy();
    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  it('translates a phrase and renders both pronunciations', async () => {
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('mode-control-thai-formal'));
    fireEvent.press(screen.getByTestId('translate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('translation-output').props.children).toBe(
        'ขอบคุณครับ',
      );
    });
    expect(
      screen.getByTestId('latin-pronunciation-word-0').props.children,
    ).toBe('khop');
    expect(
      screen.getByTestId('russian-pronunciation-word-0').props.children,
    ).toBe('кхоп');
    expect(
      screen.getByTestId('latin-word-translation-0').props.children,
    ).toBe('thank');
    expect(
      screen.getByTestId('russian-word-translation-0').props.children,
    ).toBe('благодарить');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/translate'),
      expect.objectContaining({
        body: expect.stringContaining('"mode":"thai-formal"'),
      }),
    );
  });

  it('hides word translations from settings and saves the choice', async () => {
    render(<TranslatorScreen />);
    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalled();
    });
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    expect(await screen.findByTestId('latin-word-translation-0')).toBeTruthy();

    jest.mocked(AsyncStorage.setItem).mockClear();
    fireEvent.press(screen.getByTestId('settings-button'));
    expect(screen.getByText('Настройки')).toBeTruthy();
    fireEvent(
      screen.getByTestId('word-translations-switch'),
      'valueChange',
      false,
    );

    expect(screen.queryByTestId('latin-word-translation-0')).toBeNull();
    expect(screen.queryByTestId('russian-word-translation-0')).toBeNull();
    expect(screen.getByTestId('latin-pronunciation-word-0')).toBeTruthy();
    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'thai-translate-preferences-v1',
        expect.stringContaining('"showWordTranslations":false'),
      );
    });
  });

  it('speaks the Thai field', async () => {
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');
    fireEvent.press(screen.getByTestId('speak-result'));
    await waitFor(() => {
      expect(Speech.speak).toHaveBeenCalledWith(
        'ขอบคุณครับ',
        expect.objectContaining({ language: 'th-TH' }),
      );
    });
  });

  it('copies, clears and swaps a translated value', async () => {
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');

    fireEvent.press(screen.getByTestId('copy-result'));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ขอบคุณครับ');
    });

    fireEvent.press(screen.getByTestId('swap-languages'));
    expect(screen.getByTestId('translation-input').props.value).toBe(
      'ขอบคุณครับ',
    );
    expect(screen.queryByTestId('translation-output')).toBeNull();

    fireEvent.press(screen.getByTestId('clear-input'));
    expect(screen.getByTestId('translation-input').props.value).toBe('');
  });

  it('shows a safe error and retries', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Сервис временно недоступен'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          translation: 'ขอบคุณครับ',
          thaiText: 'ขอบคุณครับ',
          pronunciation: {
            latin: 'khop khun khrap',
            russian: 'кхоп кхун кхрап',
            words: pronunciationWords,
          },
          requestId: 'retry',
        }),
      });
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy();

    fireEvent.press(screen.getByTestId('retry-button'));
    expect(await screen.findByTestId('translation-output')).toBeTruthy();
  });

  it('persists history and favorites, reopens without a request, and unstars independently', async () => {
    const mounted = render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');
    fireEvent.press(screen.getByTestId('favorite-result'));
    await waitFor(() => expect(screen.getByTestId('favorite-result').props.accessibilityState.selected).toBe(true));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(LIBRARY_STORAGE_KEY, expect.stringContaining('Спасибо')));
    const calls = jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === LIBRARY_STORAGE_KEY);
    const stored = calls[calls.length - 1][1];
    expect(JSON.parse(stored).favorites).toHaveLength(1);
    mounted.unmount();
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => key === LIBRARY_STORAGE_KEY ? stored : null);
    render(<TranslatorScreen />);
    fireEvent.press(screen.getByTestId('favorites-button'));
    await screen.findByTestId('library-entry-0');
    fireEvent.press(screen.getByTestId('library-entry-0'));
    expect(screen.getByTestId('translation-input').props.value).toBe('Спасибо');
    expect(screen.getByTestId('translation-output').props.children).toBe('ขอบคุณครับ');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('favorite-result'));
    await waitFor(() => expect(screen.getByTestId('favorite-result').props.accessibilityState.selected).toBe(false));
    fireEvent.press(screen.getByTestId('favorites-button'));
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-tab-history'));
    expect(screen.getByTestId('library-entry-0')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-star-0'));
    await waitFor(() => expect(screen.getByTestId('library-star-0').props.accessibilityState.selected).toBe(true));
  });

  it('saves the submitted settings even if controls change while translating', async () => {
    let complete!: (value: unknown) => void;
    const response = await fetchMock();
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    render(<TranslatorScreen />);
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Другой текст');
    fireEvent.press(screen.getByTestId('mode-control-thai-formal'));
    complete(response);
    await screen.findByTestId('translation-output');
    fireEvent.press(screen.getByTestId('history-button'));
    fireEvent.press(await screen.findByTestId('library-entry-0'));
    expect(screen.getByTestId('translation-input').props.value).toBe('Спасибо');
    expect(screen.getByTestId('mode-control-farang-ploy').props.accessibilityState.checked).toBe(true);
  });

  it('keeps a successful result visible when storage writes fail', async () => {
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key) => {
      if (key === LIBRARY_STORAGE_KEY) throw new Error('quota');
    });
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');
    await screen.findByText(/Последние изменения могут потеряться/);
    expect(screen.queryByTestId('retry-button')).toBeNull();
    fireEvent.press(screen.getByTestId('history-button'));
    expect(screen.getByTestId('library-entry-0')).toBeTruthy();
  });

  it('does not overwrite unread data after a storage read failure', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
      if (key === LIBRARY_STORAGE_KEY) throw new Error('unavailable');
      return null;
    });
    render(<TranslatorScreen />);
    await screen.findByText(/Не удалось загрузить историю/);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');
    expect(screen.getByTestId('favorite-result').props.accessibilityState.disabled).toBe(true);
    expect(jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === LIBRARY_STORAGE_KEY)).toHaveLength(0);
  });

  it('waits for hydration before adding a completed translation', async () => {
    let hydrate!: (value: string | null) => void;
    jest.mocked(AsyncStorage.getItem).mockImplementation((key) => key === LIBRARY_STORAGE_KEY
      ? new Promise((resolve) => { hydrate = resolve; }) : Promise.resolve(null));
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('translation-output');
    expect(jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === LIBRARY_STORAGE_KEY)).toHaveLength(0);
    hydrate(null);
    fireEvent.press(screen.getByTestId('history-button'));
    expect(await screen.findByTestId('library-entry-0')).toBeTruthy();
  });

});
