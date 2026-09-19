import { type AccountUser } from '@thai-translate/contracts';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { cachedUser, finishWebLogin, getSession, rememberUser, signIn, signOut } from './auth';

type AccountContextValue = {
  user: AccountUser | null; loading: boolean; busy: boolean; available: boolean | null;
  error: string | null; login: () => Promise<void>; logout: () => Promise<void>;
};
const AccountContext = createContext<AccountContextValue>({
  user: null, loading: false, busy: false, available: null, error: null,
  login: async () => undefined, logout: async () => undefined,
});
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const cached = await cachedUser();
        if (active) setUser(cached);
        const signedIn = await finishWebLogin();
        if (signedIn && active) setUser(signedIn);
        const session = await getSession();
        await rememberUser(session.user);
        if (active) { setUser(session.user); setAvailable(session.available); }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Не удалось проверить аккаунт');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function login() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const next = await signIn();
      if (next) { setUser(next); setAvailable(true); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось войти');
    } finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await signOut(); setUser(null); }
    catch { setError('Не удалось выйти. Проверьте соединение и повторите.'); }
    finally { setBusy(false); }
  }
  return <AccountContext.Provider value={{ user, loading, busy, available, error, login, logout }}>{children}</AccountContext.Provider>;
}
