import { useEffect, useRef, useState } from 'react';

import {
  addToHistory, emptyLibrary, loadLibrary, saveLibrary, toggleFavorite,
  type TranslationEntry, type TranslationLibrary,
} from './library';

export function useTranslationLibrary() {
  const [library, setLibrary] = useState(emptyLibrary);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const current = useRef(library);
  const hydration = useRef<Promise<void> | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    hydration.current = loadLibrary().then((saved) => {
      current.current = saved;
      setLibrary(saved);
      setReady(true);
    });
    void hydration.current.catch(() => {
      setStorageError('Не удалось загрузить историю и избранное. Перезапустите приложение.');
    });
  }, []);

  async function update(change: (value: TranslationLibrary) => TranslationLibrary) {
    try {
      await hydration.current;
    } catch {
      return;
    }
    const next = change(current.current);
    current.current = next;
    setLibrary(next);
    const version = ++revision.current;
    try {
      await saveLibrary(next);
      if (version === revision.current) setStorageError(null);
    } catch {
      if (version === revision.current) {
        setStorageError('Не удалось сохранить на устройстве. Последние изменения могут потеряться после закрытия.');
      }
    }
  }

  return {
    library, ready, storageError,
    record: (entry: TranslationEntry) => update((value) => addToHistory(value, entry)),
    toggle: (entry: TranslationEntry) => update((value) => toggleFavorite(value, entry)),
  };
}
