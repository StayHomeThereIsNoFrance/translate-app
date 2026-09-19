import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryOperationSchema, TranslationLibrarySchema, type LibraryOperation, type TranslationEntry, type TranslationLibrary } from '@thai-translate/contracts';
import * as Crypto from 'expo-crypto';

import { addToHistory, emptyLibrary } from '../translator/library';

export type AccountLibraryState = { library: TranslationLibrary; pending: LibraryOperation[]; imported: string[] };
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
export type SyncTransport = (userId: string, operations: LibraryOperation[]) => Promise<TranslationLibrary>;

export function applyOperation(library: TranslationLibrary, operation: LibraryOperation): TranslationLibrary {
  const { entry } = operation;
  const exists = [...library.history, ...library.favorites].some((item) => item.id === entry.id);
  if (operation.kind === 'import' && exists) return library;
  let next = operation.kind === 'record' || (operation.kind === 'import' && operation.inHistory)
    ? addToHistory(library, entry) : library;
  if (operation.kind !== 'record') {
    next = { ...next, favorites: operation.favorite
      ? [entry, ...next.favorites.filter((item) => item.id !== entry.id)]
      : next.favorites.filter((item) => item.id !== entry.id) };
  }
  return next;
}

/** Each local update is persisted before upload. A response only acknowledges its own batch. */
export class SyncEngine {
  state: AccountLibraryState = { library: emptyLibrary(), pending: [], imported: [] };
  readonly ready: Promise<void>;
  private tail: Promise<void> = Promise.resolve();
  private flight: Promise<void> | null = null;
  private readonly key: string;
  constructor(
    readonly userId: string,
    private readonly transport: SyncTransport,
    private readonly changed: (state: AccountLibraryState) => void,
    private readonly storage: Storage = AsyncStorage,
    private readonly uuid: () => string = Crypto.randomUUID,
  ) {
    this.key = `thai-translate-account-v1-${userId}`;
    this.ready = this.load();
  }
  private async load() {
    const raw = await this.storage.getItem(this.key);
    if (raw) {
      const decoded = JSON.parse(raw) as AccountLibraryState;
      // Invalid durable queues are not silently discarded or overwritten.
      this.state = {
        library: TranslationLibrarySchema.parse(decoded.library),
        pending: decoded.pending.map((item) => LibraryOperationSchema.parse(item)),
        imported: Array.isArray(decoded.imported) ? decoded.imported.filter((id) => typeof id === 'string') : [],
      };
    }
    this.changed(this.state);
  }
  private change(update: (current: AccountLibraryState) => AccountLibraryState): Promise<void> {
    const next = this.tail.catch(() => undefined).then(async () => {
      await this.ready;
      const state = update(this.state);
      await this.storage.setItem(this.key, JSON.stringify(state));
      this.state = state;
      this.changed(state);
    });
    this.tail = next;
    return next;
  }
  importGuest(guest: TranslationLibrary) {
    return this.change((state) => {
      const entries = new Map([...guest.history, ...guest.favorites].map((entry) => [entry.id, entry]));
      const imported = new Set(state.imported);
      const operations: LibraryOperation[] = [];
      for (const entry of entries.values()) {
        if (imported.has(entry.id)) continue;
        operations.push({ id: this.uuid(), kind: 'import', entry,
          favorite: guest.favorites.some((item) => item.id === entry.id),
          inHistory: guest.history.some((item) => item.id === entry.id) });
        imported.add(entry.id);
      }
      return { library: operations.reduce(applyOperation, state.library), pending: [...state.pending, ...operations], imported: [...imported] };
    });
  }
  record(entry: TranslationEntry) {
    return this.enqueue('record', entry);
  }
  toggle(entry: TranslationEntry) {
    return this.enqueue('favorite', entry);
  }
  private enqueue(kind: 'record' | 'favorite', entry: TranslationEntry) {
    return this.change((state) => {
      const operation = LibraryOperationSchema.parse({ id: this.uuid(), kind, entry, inHistory: true,
        favorite: kind === 'favorite' && !state.library.favorites.some((item) => item.id === entry.id) });
      return { ...state, library: applyOperation(state.library, operation), pending: [...state.pending, operation] };
    });
  }
  sync(): Promise<void> {
    if (this.flight) return this.flight;
    this.flight = this.flush().finally(() => { this.flight = null; });
    return this.flight;
  }
  private async flush() {
    await this.ready;
    await this.tail.catch(() => undefined);
    do {
      const batch = this.state.pending.slice(0, 50);
      const acknowledged = new Set(batch.map((operation) => operation.id));
      const remote = TranslationLibrarySchema.parse(await this.transport(this.userId, batch));
      await this.change((state) => {
        const pending = state.pending.filter((operation) => !acknowledged.has(operation.id));
        return { ...state, pending, library: pending.reduce(applyOperation, remote) };
      });
    } while (this.state.pending.length > 0);
  }
}
