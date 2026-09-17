import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TranslationRequestSchema,
  TranslationResultSchema,
  type TranslationRequest,
  type TranslationResult,
} from '@thai-translate/contracts';

export const LIBRARY_STORAGE_KEY = 'thai-translate-library-v1';
export const HISTORY_LIMIT = 200;

export type TranslationEntry = {
  id: string;
  createdAt: string;
  request: TranslationRequest;
  result: TranslationResult;
};

export type TranslationLibrary = {
  history: TranslationEntry[];
  favorites: TranslationEntry[];
};

export function emptyLibrary(): TranslationLibrary {
  return { history: [], favorites: [] };
}

function parseEntries(value: unknown): TranslationEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const request = TranslationRequestSchema.safeParse(item.request);
    const result = TranslationResultSchema.safeParse(item.result);
    if (
      typeof item.id !== 'string' || !item.id || seen.has(item.id) ||
      typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
      !request.success || !result.success
    ) return [];
    seen.add(item.id);
    return [{ id: item.id, createdAt: item.createdAt, request: request.data, result: result.data }];
  });
}

export async function loadLibrary(): Promise<TranslationLibrary> {
  // Propagate I/O errors: writing an empty fallback could erase an unread library.
  const raw = await AsyncStorage.getItem(LIBRARY_STORAGE_KEY);
  if (!raw) return emptyLibrary();
  try {
    const decoded = JSON.parse(raw) as Partial<TranslationLibrary> | null;
    return {
      history: parseEntries(decoded?.history).slice(0, HISTORY_LIMIT),
      favorites: parseEntries(decoded?.favorites),
    };
  } catch {
    return emptyLibrary();
  }
}

let pendingWrite: Promise<void> = Promise.resolve();

export function saveLibrary(library: TranslationLibrary): Promise<void> {
  const serialized = JSON.stringify(library);
  const write = pendingWrite.catch(() => undefined).then(() =>
    AsyncStorage.setItem(LIBRARY_STORAGE_KEY, serialized),
  );
  pendingWrite = write;
  return write;
}

export function addToHistory(library: TranslationLibrary, entry: TranslationEntry): TranslationLibrary {
  return {
    ...library,
    history: [entry, ...library.history.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT),
  };
}

export function toggleFavorite(library: TranslationLibrary, entry: TranslationEntry): TranslationLibrary {
  return {
    ...library,
    favorites: library.favorites.some((item) => item.id === entry.id)
      ? library.favorites.filter((item) => item.id !== entry.id)
      : [entry, ...library.favorites],
  };
}
