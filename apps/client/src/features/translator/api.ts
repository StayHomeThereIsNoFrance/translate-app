import {
  ApiErrorSchema,
  TranslationResultSchema,
  type TranslationRequest,
  type TranslationResult,
} from '@thai-translate/contracts';
import { Platform } from 'react-native';

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

async function parseError(response: Response): Promise<Error> {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return TranslationResultSchema.parse(await response.json());
}
