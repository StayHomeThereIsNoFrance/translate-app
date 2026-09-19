import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { accountRequest, cachedUser, finishWebLogin, getSession, rememberUser, signIn, signOut, syncLibrary } from '../auth';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(), WebBrowserResultType: { CANCEL: 'cancel' } }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(1)),
  digestStringAsync: jest.fn(async () => 'A'.repeat(43) + '='),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, CryptoEncoding: { BASE64: 'base64' },
}));
const user = { id: 'google1', name: 'Tester', email: 'test@example.com' };
const fetchMock = jest.fn();
const respond = (value: unknown, status = 200) => ({ ok: status < 400, status, json: async () => value });
const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  globalThis.fetch = fetchMock as typeof fetch;
  fetchMock.mockReset();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
});
afterAll(() => Object.defineProperty(Platform, 'OS', { value: originalOS }));

it('runs native browser login with PKCE and stores only the app session securely', async () => {
  fetchMock.mockResolvedValueOnce(respond({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' }))
    .mockResolvedValueOnce(respond({ user, token: 'app-session-token' }));
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'success', url: 'thaitranslate://auth/callback?auth_code=handoff' });
  expect(await signIn()).toEqual(user);
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(expect.stringContaining('https://accounts.google.com/'), 'thaitranslate://auth/callback');
  expect(Crypto.digestStringAsync).toHaveBeenCalled();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ platform: 'native', challenge: 'A'.repeat(43) });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).verifier).toBe('01'.repeat(32));
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('thai-translate-session', 'app-session-token');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('thai-translate-account-user-v1', JSON.stringify(user));
});

it('handles cancellation, invalid callback URLs and missing tokens', async () => {
  fetchMock.mockResolvedValue(respond({ url: 'https://accounts.google.com/auth' }));
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.CANCEL });
  await expect(signIn()).rejects.toThrow('отменён');
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type: 'success', url: 'evil://callback?auth_code=bad' });
  await expect(signIn()).rejects.toThrow('Некорректный ответ');
  for (const query of ['auth_error=cancelled', 'auth_error=failed', 'other=missing']) {
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type: 'success', url: `thaitranslate://auth/callback?${query}` });
    await expect(signIn()).rejects.toThrow();
  }
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type: 'success', url: 'thaitranslate://auth/callback?auth_code=valid' });
  fetchMock.mockResolvedValueOnce(respond({ url: 'https://accounts.google.com/auth' })).mockResolvedValueOnce(respond({ user }));
  await expect(signIn()).rejects.toThrow('не вернул сессию');
  fetchMock.mockResolvedValueOnce(respond({ url: 'https://evil.test/auth' }));
  await expect(signIn()).rejects.toThrow('Некорректный адрес');
});

it('attaches native tokens, validates session/library responses and clears revoked sessions', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('native-token');
  fetchMock.mockResolvedValueOnce(respond({ user, available: true }));
  expect((await getSession()).user).toEqual(user);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer native-token');
  fetchMock.mockResolvedValueOnce(respond({ history: [], favorites: [] }));
  expect(await syncLibrary(user.id, [])).toEqual({ history: [], favorites: [] });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).userId).toBe(user.id);
  fetchMock.mockResolvedValueOnce(respond({ ok: true }));
  await signOut();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('thai-translate-account-user-v1', 'null');
  fetchMock.mockResolvedValueOnce(respond({ error: { message: 'Сессия истекла' } }, 401));
  await expect(accountRequest('/api/auth/session')).rejects.toMatchObject({ status: 401, message: 'Сессия истекла' });
  fetchMock.mockResolvedValueOnce(respond({}, 503));
  await expect(accountRequest('/api/auth/session')).rejects.toThrow('Не удалось связаться');
});

it('reads only validated cached profiles', async () => {
  expect(await cachedUser()).toBeNull();
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{bad');
  expect(await cachedUser()).toBeNull();
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(user));
  expect(await cachedUser()).toEqual(user);
  await rememberUser(null);
  expect(await finishWebLogin()).toBeNull();
});

it('redirects web login with a tab-bound verifier and completes only once using cookies', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  const browser = { location: { origin: 'https://translate.test', pathname: '/', hash: '', assign: jest.fn() },
    sessionStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
    history: { replaceState: jest.fn() } };
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
  try {
    expect(await finishWebLogin()).toBeNull();
    fetchMock.mockResolvedValueOnce(respond({ url: 'https://accounts.google.com/auth' }));
    await signIn();
    expect(browser.location.assign).toHaveBeenCalledWith('https://accounts.google.com/auth');
    expect(values.size).toBe(1);
    browser.location.hash = '#auth_code=web-code';
    fetchMock.mockResolvedValueOnce(respond({ user }));
    expect(await finishWebLogin()).toEqual(user);
    expect(await finishWebLogin()).toEqual(user);
    expect(values.size).toBe(0);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
    fetchMock.mockResolvedValueOnce(respond({ ok: true }));
    await signOut();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  } finally { Object.defineProperty(globalThis, 'window', { value: originalWindow }); }
});
