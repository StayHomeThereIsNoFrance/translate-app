import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { type TranslationEntry } from '@thai-translate/contracts';
import { emptyLibrary, loadLibrary } from '../translator/library';
import { syncLibrary } from './auth';
import { SyncEngine, type AccountLibraryState } from './sync-engine';

export function useAccountLibrary(userId: string | undefined, authLoading: boolean) {
  const [snapshot, setSnapshot] = useState<{ userId: string; state: AccountLibraryState } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const engine = useRef<SyncEngine | null>(null);

  const sync = useCallback(async () => {
    const current = engine.current;
    if (!current || authLoading) return;
    setSyncing(true);
    try {
      await current.sync();
      if (engine.current === current) { setError(null); setLastSynced(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })); }
    } catch (failure) {
      if (engine.current === current) setError(failure instanceof Error && 'status' in failure
        ? failure.message : 'Нет связи с синхронизацией. Изменения сохранены на устройстве и будут отправлены позже.');
    } finally { if (engine.current === current) setSyncing(false); }
  }, [authLoading]);

  useEffect(() => {
    if (!userId || authLoading) { engine.current = null; return; }
    const current = new SyncEngine(userId, syncLibrary, (state) => {
      if (engine.current === current) setSnapshot({ userId, state });
    });
    engine.current = current;
    void (async () => {
      try {
        await current.ready;
        if (engine.current === current) { setError(null); setLastSynced(null); }
        await current.importGuest(await loadLibrary());
        if (engine.current === current) { setReady(true); void sync(); }
      } catch { if (engine.current === current) setError('Не удалось загрузить сохранённые переводы аккаунта. Перезапустите приложение.'); }
    })();
    const interval = setInterval(() => { if (AppState.currentState === 'active' || Platform.OS === 'web') void sync(); }, 30000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    const onFocus = () => { void sync(); };
    if (Platform.OS === 'web') { window.addEventListener('focus', onFocus); window.addEventListener('online', onFocus); }
    return () => {
      engine.current = null; clearInterval(interval); listener.remove();
      if (Platform.OS === 'web') { window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); }
    };
  }, [userId, authLoading, sync]);

  // Capture the initiating owner, so an in-flight translation cannot move to a different account.
  const owner = userId;
  const owningEngine = engine.current;
  const record = async (entry: TranslationEntry) => {
    const current = owningEngine;
    if (!current || current.userId !== owner) return;
    try { await current.record(entry); if (engine.current === current) void sync(); }
    catch { if (engine.current === current) setError('Не удалось сохранить перевод на устройстве. Попробуйте снова.'); }
  };
  const toggle = async (entry: TranslationEntry) => {
    const current = owningEngine;
    if (!current || current.userId !== owner) return;
    try { await current.toggle(entry); if (engine.current === current) void sync(); }
    catch { if (engine.current === current) setError('Не удалось сохранить избранное на устройстве. Попробуйте снова.'); }
  };
  const state = snapshot && snapshot.userId === userId ? snapshot.state : null;
  return { library: state?.library ?? emptyLibrary(), ready: ready && snapshot?.userId === userId,
    storageError: error, pending: state?.pending.length ?? 0, syncing, lastSynced, sync, record, toggle };
}
