import { type LibraryOperation, type TranslationEntry, type TranslationLibrary } from '@thai-translate/contracts';
import { SyncEngine, applyOperation } from '../sync-engine';
import { emptyLibrary } from '../../translator/library';

const entry: TranslationEntry = { id: 'entry-1', createdAt: '2026-09-19T10:00:00.000Z', request: { text: 'Спасибо', sourceLanguage: 'ru', targetLanguage: 'th', mode: 'thai-formal', speakerGender: 'male' }, result: { translation: 'ขอบคุณ', thaiText: 'ขอบคุณ', requestId: 'req-1', pronunciation: { latin: 'khun', russian: 'кхун', words: [{ latin: 'khun', russian: 'кхун', englishTranslation: 'you', russianTranslation: 'вас' }] } } };
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: jest.fn(async (key: string) => data.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }) };
}
function server() {
  let library = emptyLibrary();
  const seen = new Set<string>();
  return jest.fn(async (_user: string, operations: LibraryOperation[]) => {
    for (const operation of operations) {
      if (!seen.has(operation.id)) { library = applyOperation(library, operation); seen.add(operation.id); }
    }
    return library;
  });
}

it('imports guest data, syncs two devices and propagates unstars without history loss', async () => {
  const remote = server();
  const diskA = storage();
  const a = new SyncEngine('same-user', remote, jest.fn(), diskA, uuid);
  const b = new SyncEngine('same-user', remote, jest.fn(), storage(), uuid);
  await a.importGuest({ history: [entry], favorites: [entry] });
  await a.importGuest({ history: [entry], favorites: [entry] });
  expect(a.state.pending).toHaveLength(1);
  await a.sync(); await b.sync();
  expect(b.state.library).toEqual(a.state.library);
  await b.toggle(entry); await b.sync(); await a.sync();
  expect(a.state.library.favorites).toEqual([]);
  expect(a.state.library.history).toEqual([entry]);
  const restarted = new SyncEngine('same-user', remote, jest.fn(), diskA, uuid);
  await restarted.ready;
  expect(restarted.state.library).toEqual(a.state.library);
  const other = new SyncEngine('other-user', remote, jest.fn(), diskA, uuid);
  await other.ready;
  expect(other.state.library).toEqual(emptyLibrary());
});

it('retains offline changes through restart and retries the same operation IDs', async () => {
  const disk = storage();
  const remote = server();
  remote.mockRejectedValueOnce(new Error('offline'));
  const a = new SyncEngine('u', remote, jest.fn(), disk, uuid);
  await a.record(entry); await a.toggle(entry);
  const ids = a.state.pending.map((item) => item.id);
  await expect(a.sync()).rejects.toThrow('offline');
  const b = new SyncEngine('u', remote, jest.fn(), disk, uuid);
  await b.ready;
  expect(b.state.pending.map((item) => item.id)).toEqual(ids);
  await b.sync();
  expect(b.state.pending).toHaveLength(0);
  expect(b.state.library.favorites).toEqual([entry]);
});

it('preserves edits made during a sync and batches large queues', async () => {
  let finish!: (value: TranslationLibrary) => void;
  const remote = server();
  remote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const a = new SyncEngine('u', remote, jest.fn(), storage(), uuid);
  await a.record(entry);
  const flight = a.sync();
  expect(a.sync()).toBe(flight);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await a.toggle(entry);
  finish({ history: [entry], favorites: [] });
  await flight;
  expect(a.state.library.favorites).toEqual([entry]);
  for (let i = 0; i < 105; i++) await a.record({ ...entry, id: `entry-${i + 2}` });
  await a.sync();
  expect(remote.mock.calls.every(([, batch]) => batch.length <= 50)).toBe(true);
  expect(a.state.pending).toHaveLength(0);
});

it('does not upload unsaved operations or erase a corrupt local queue', async () => {
  const disk = storage();
  const remote = server();
  const a = new SyncEngine('u', remote, jest.fn(), disk, uuid);
  disk.setItem.mockRejectedValueOnce(new Error('quota'));
  await expect(a.record(entry)).rejects.toThrow('quota');
  expect(a.state.pending).toHaveLength(0);
  expect(remote).not.toHaveBeenCalled();
  await a.record(entry); await a.sync();
  disk.data.set('thai-translate-account-v1-broken', '{bad');
  const broken = new SyncEngine('broken', remote, jest.fn(), disk, uuid);
  await expect(broken.ready).rejects.toThrow();
  await expect(broken.record(entry)).rejects.toThrow();
  expect(disk.data.get('thai-translate-account-v1-broken')).toBe('{bad');
});

it('imports favorites outside history without adding them to history', async () => {
  const a = new SyncEngine('u', server(), jest.fn(), storage(), uuid);
  await a.importGuest({ history: [], favorites: [entry] });
  expect(a.state.library).toEqual({ history: [], favorites: [entry] });
  await a.sync();
  expect(a.state.library.history).toEqual([]);
  expect(applyOperation(a.state.library, { id: uuid(), kind: 'import', entry, inHistory: true, favorite: false })).toEqual(a.state.library);
});
