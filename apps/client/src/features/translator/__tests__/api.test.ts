import * as SecureStore from 'expo-secure-store';

import {
  AuthRequiredError,
  login,
  translate,
} from '../api';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as typeof fetch;

const request = {
  text: 'Спасибо',
  sourceLanguage: 'ru' as const,
  targetLanguage: 'th' as const,
  mode: 'thai-formal' as const,
  speakerGender: 'male' as const,
};

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

describe('translation API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://translate.test/';
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  });

  it('sends a translation and validates the response', async () => {
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
        requestId: 'request-1',
      }),
    });

    await expect(translate(request)).resolves.toMatchObject({
      translation: 'ขอบคุณครับ',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://translate.test/api/v1/translate',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  });

  it('adds the native bearer token when one exists', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('native-token');
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
        requestId: 'request-2',
      }),
    });

    await translate(request);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer native-token',
    });
  });

  it('maps authentication, public API and malformed errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await expect(translate(request)).rejects.toBeInstanceOf(AuthRequiredError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({
        error: { code: 'UPSTREAM', message: 'Попробуйте ещё раз' },
      }),
    });
    await expect(translate(request)).rejects.toThrow('Попробуйте ещё раз');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid JSON');
      },
    });
    await expect(translate(request)).rejects.toThrow(
      'Не удалось связаться с сервисом перевода',
    );
  });

  it('logs in and persists a native token only when returned', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'session-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: null }),
      });

    await login('2468');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'thai-translate-session',
      'session-token',
    );

    jest.mocked(SecureStore.setItemAsync).mockClear();
    await login('2468');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('surfaces login errors through the same safe parser', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await expect(login('bad-pin')).rejects.toBeInstanceOf(AuthRequiredError);
  });
});
