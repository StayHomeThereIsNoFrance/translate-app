import { translate } from '../api';

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
  });

  it('maps public API and malformed errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await expect(translate(request)).rejects.toThrow(
      'Не удалось связаться с сервисом перевода',
    );

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
});
