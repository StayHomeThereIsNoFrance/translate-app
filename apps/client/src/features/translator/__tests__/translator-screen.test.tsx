import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';

import { TranslatorScreen } from '../translator-screen';

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

  it('renders the required controls and empty state', () => {
    render(<TranslatorScreen />);
    expect(screen.getByText('Farang - Ploy')).toBeTruthy();
    expect(screen.getByText('Thai formal')).toBeTruthy();
    expect(screen.getByText('Мужчина')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('Тайский')).toBeTruthy();
    expect(screen.getByText('Перевод появится здесь')).toBeTruthy();
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
    expect(screen.getByTestId('latin-pronunciation').props.children).toBe(
      'khop khun khrap',
    );
    expect(screen.getByTestId('russian-pronunciation').props.children).toBe(
      'кхоп кхун кхрап',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/translate'),
      expect.objectContaining({
        body: expect.stringContaining('"mode":"thai-formal"'),
      }),
    );
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

  it('asks for PIN, logs in and resumes the translation', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'native-token' }),
      })
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
          requestId: 'after-login',
        }),
      });
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    expect(await screen.findByTestId('pin-input')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('pin-input'), '2468');
    fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByTestId('translation-output')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the PIN dialog open after a failed login', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
    render(<TranslatorScreen />);
    fireEvent.changeText(screen.getByTestId('translation-input'), 'Спасибо');
    fireEvent.press(screen.getByTestId('translate-button'));
    await screen.findByTestId('pin-input');

    fireEvent.changeText(screen.getByTestId('pin-input'), 'wrong');
    fireEvent.press(screen.getByTestId('pin-submit'));
    expect(await screen.findByText('Требуется PIN')).toBeTruthy();
    expect(screen.getByTestId('pin-input')).toBeTruthy();
  });
});
