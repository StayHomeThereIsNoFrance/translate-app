import {
  ApiErrorSchema,
  TranslationResultSchema,
  type TranslationRequest,
  type TranslationResult,
} from '@thai-translate/contracts';
import { Platform } from 'react-native';

import { getSessionToken, setSessionToken } from './session-token';

export class AuthRequiredError extends Error {
  constructor(message = 'Требуется PIN') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  if (configured) {
    return configured;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://10.0.2.2:3000';
}

async function requestHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseError(response: Response): Promise<Error> {
  if (response.status === 401) {
    return new AuthRequiredError();
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(body);
  return new Error(
    parsed.success
      ? parsed.data.error.message
      : 'Не удалось связаться с сервисом перевода',
  );
}

export async function translate(
  request: TranslationRequest,
): Promise<TranslationResult> {
  const response = await fetch(`${apiBaseUrl()}/api/v1/translate`, {
    method: 'POST',
    credentials: 'include',
    headers: await requestHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return TranslationResultSchema.parse(await response.json());
}

export async function login(pin: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl()}/api/v1/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token === 'string' && body.token) {
    await setSessionToken(body.token);
  }
}
