import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountSessionSchema, AccountUserSchema, TranslationLibrarySchema, type AccountUser, type LibraryOperation } from '@thai-translate/contracts';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { apiBaseUrl } from '../translator/api';

const TOKEN_KEY = 'thai-translate-session';
const USER_KEY = 'thai-translate-account-user-v1';
const VERIFIER_KEY = 'thai-translate-login-verifier';
const RETURN_URI = 'thaitranslate://auth/callback';
export class AccountError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function accountRequest(path: string, body?: unknown): Promise<unknown> {
  const token = Platform.OS === 'web' ? null : await SecureStore.getItemAsync(TOKEN_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const value = await response.json() as { error?: { message?: string } };
    if (!response.ok) throw new AccountError(value.error?.message ?? 'Не удалось связаться с сервером синхронизации', response.status);
    return value;
  } finally { clearTimeout(timeout); }
}
export async function cachedUser(): Promise<AccountUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return AccountUserSchema.parse(JSON.parse(raw)); } catch { return null; }
}
export async function rememberUser(user: AccountUser | null) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
export async function getSession() {
  return AccountSessionSchema.parse(await accountRequest('/api/auth/session'));
}
export async function syncLibrary(userId: string, operations: LibraryOperation[]) {
  return TranslationLibrarySchema.parse(await accountRequest('/api/v1/library/sync', { userId, operations }));
}
async function exchange(code: string, verifier: string): Promise<AccountUser> {
  const result = await accountRequest('/api/auth/exchange', { code, verifier }) as { user: unknown; token?: string };
  const user = AccountUserSchema.parse(result.user);
  if (Platform.OS !== 'web') {
    if (!result.token) throw new Error('Сервер не вернул сессию приложения');
    await SecureStore.setItemAsync(TOKEN_KEY, result.token);
  }
  await rememberUser(user);
  return user;
}
function authCode(params: URLSearchParams): string {
  if (params.has('auth_error')) throw new Error(params.get('auth_error') === 'cancelled' ? 'Вход отменён' : 'Не удалось войти через Google. Попробуйте снова.');
  const code = params.get('auth_code');
  if (!code) throw new Error('Не удалось завершить вход');
  return code;
}
let completingWeb: Promise<AccountUser | null> | null = null;
export function finishWebLogin(): Promise<AccountUser | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return Promise.resolve(null);
  if (completingWeb) return completingWeb;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('auth_code') && !params.has('auth_error')) return Promise.resolve(null);
  completingWeb = (async () => {
    const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
    window.sessionStorage.removeItem(VERIFIER_KEY);
    window.history.replaceState(null, '', window.location.pathname);
    const code = authCode(params);
    if (!verifier) throw new Error('Вход начат в другой вкладке. Начните вход снова.');
    return exchange(code, verifier);
  })();
  return completingWeb;
}
export async function signIn(): Promise<AccountUser | null> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const base64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const challenge = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (Platform.OS === 'web') window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  const result = await accountRequest('/api/auth/start', { platform: Platform.OS === 'web' ? 'web' : 'native', challenge }) as { url: string };
  const url = new URL(result.url);
  if (url.origin !== 'https://accounts.google.com') throw new Error('Некорректный адрес входа');
  if (Platform.OS === 'web') {
    window.location.assign(result.url);
    return null;
  }
  const browser = await WebBrowser.openAuthSessionAsync(result.url, RETURN_URI);
  if (browser.type !== 'success') throw new Error('Вход отменён');
  const callback = new URL(browser.url);
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== RETURN_URI) throw new Error('Некорректный ответ входа');
  return exchange(authCode(callback.searchParams), verifier);
}
export async function signOut() {
  await accountRequest('/api/auth/logout', {});
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(TOKEN_KEY);
  await rememberUser(null);
}
