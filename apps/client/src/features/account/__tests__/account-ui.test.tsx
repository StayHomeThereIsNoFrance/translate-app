import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Pressable } from 'react-native';
import { AccountProvider, useAccount } from '../account-context';
import { AccountPanel } from '../account-panel';
import { useAccountLibrary } from '../use-account-library';
import * as auth from '../auth';
import PrivacyPage from '../../../app/privacy';
import AuthCallback from '../../../app/auth/callback';

jest.mock('../auth', () => ({ cachedUser: jest.fn(), finishWebLogin: jest.fn(), getSession: jest.fn(), rememberUser: jest.fn(), signIn: jest.fn(), signOut: jest.fn(), syncLibrary: jest.fn() }));
jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { Link: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>, Redirect: () => <MockText>Redirect</MockText> };
});
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
const user = { id: 'user-a', name: 'Tester', email: 'tester@example.com' };
const entry = { id: 'entry-1', createdAt: '2026-09-19T10:00:00.000Z', request: { text: 'Спасибо', sourceLanguage: 'ru' as const, targetLanguage: 'th' as const, mode: 'thai-formal' as const, speakerGender: 'male' as const }, result: { translation: 'ขอบคุณ', thaiText: 'ขอบคุณ', requestId: 'req-1', pronunciation: { latin: 'khun', russian: 'кхун', words: [{ latin: 'khun', russian: 'кхун', englishTranslation: 'you', russianTranslation: 'вас' }] } } };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(auth.cachedUser).mockResolvedValue(null);
  jest.mocked(auth.finishWebLogin).mockResolvedValue(null);
  jest.mocked(auth.getSession).mockResolvedValue({ available: true, user: null });
  jest.mocked(auth.signIn).mockResolvedValue(user);
  jest.mocked(auth.signOut).mockResolvedValue(undefined);
  jest.mocked(auth.rememberUser).mockResolvedValue(undefined);
  jest.mocked(auth.syncLibrary).mockResolvedValue({ history: [], favorites: [] });
  jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined);
});

function Harness() {
  const account = useAccount();
  return <>
    <Text testID="identity">{account.user?.id ?? 'guest'}</Text>
    <Pressable testID="login" onPress={() => void account.login()} /><Pressable testID="logout" onPress={() => void account.logout()} />
    <AccountPanel visible onClose={jest.fn()} pending={0} syncing={false} lastSynced="12:00" syncError={null} onSync={jest.fn()} />
  </>;
}

it('signs in, displays the account and logs out into guest mode', async () => {
  render(<AccountProvider><Harness /></AccountProvider>);
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  expect(screen.getByText('Ваши переводы — на всех устройствах')).toBeTruthy();
  fireEvent.press(screen.getByTestId('google-login'));
  await waitFor(() => expect(screen.getByTestId('identity').props.children).toBe(user.id));
  expect(screen.getByText(user.email)).toBeTruthy();
  expect(screen.getByText('Синхронизировано в 12:00')).toBeTruthy();
  fireEvent.press(screen.getByTestId('sync-now'));
  fireEvent.press(screen.getByTestId('account-logout'));
  await waitFor(() => expect(screen.getByTestId('identity').props.children).toBe('guest'));
});

it('keeps cached account offline and reports failed login/logout', async () => {
  jest.mocked(auth.cachedUser).mockResolvedValue(user);
  jest.mocked(auth.getSession).mockRejectedValue(new Error('offline'));
  render(<AccountProvider><Harness /></AccountProvider>);
  await screen.findByText('offline');
  expect(screen.getByTestId('identity').props.children).toBe(user.id);
  jest.mocked(auth.signIn).mockRejectedValue(new Error('Вход отменён'));
  fireEvent.press(screen.getByTestId('google-login'));
  await screen.findByText('Вход отменён');
  jest.mocked(auth.signOut).mockRejectedValue(new Error('offline'));
  fireEvent.press(screen.getByTestId('account-logout'));
  await screen.findByText('Не удалось выйти. Проверьте соединение и повторите.');
});

it('completes a web callback, handles unavailable auth and renders public routes', async () => {
  jest.mocked(auth.finishWebLogin).mockResolvedValue(user);
  jest.mocked(auth.getSession).mockResolvedValue({ user, available: false });
  const mounted = render(<AccountProvider><Harness /></AccountProvider>);
  await screen.findByText(/Вход через Google пока не настроен/);
  expect(screen.getByTestId('identity').props.children).toBe(user.id);
  mounted.unmount();
  const privacy = render(<PrivacyPage />);
  expect(screen.getByText('Данные и конфиденциальность')).toBeTruthy();
  privacy.unmount();
  render(<AuthCallback />);
  expect(screen.getByText('Redirect')).toBeTruthy();
});

it('loads account library, persists edits, handles offline sync and isolates account changes', async () => {
  const hook = renderHook(({ id }: { id: string }) => useAccountLibrary(id, false), { initialProps: { id: user.id } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await waitFor(() => expect(hook.result.current.lastSynced).not.toBeNull());
  jest.mocked(auth.syncLibrary).mockRejectedValue(new Error('offline'));
  await act(async () => { await hook.result.current.record(entry); });
  await waitFor(() => expect(hook.result.current.storageError).toContain('Нет связи'));
  expect(hook.result.current.pending).toBe(1);
  await act(async () => { await hook.result.current.toggle(entry); });
  expect(hook.result.current.library.favorites).toEqual([entry]);
  jest.mocked(auth.syncLibrary).mockResolvedValue({ history: [entry], favorites: [entry] });
  await act(async () => { await hook.result.current.sync(); });
  expect(hook.result.current.pending).toBe(0);
  jest.mocked(auth.syncLibrary).mockResolvedValue({ history: [], favorites: [] });
  hook.rerender({ id: 'other' });
  expect(hook.result.current.library.history).toEqual([]);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  hook.unmount();
});

it('surfaces durable storage failures and authentication errors', async () => {
  const hook = renderHook(() => useAccountLibrary(user.id, false));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await waitFor(() => expect(hook.result.current.syncing).toBe(false));
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('quota'));
  await act(async () => { await hook.result.current.record(entry); });
  expect(hook.result.current.storageError).toContain('Не удалось сохранить перевод');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('quota'));
  await act(async () => { await hook.result.current.toggle(entry); });
  expect(hook.result.current.storageError).toContain('Не удалось сохранить избранное');
  jest.mocked(auth.syncLibrary).mockRejectedValue(Object.assign(new Error('Войдите снова'), { status: 401 }));
  await act(async () => { await hook.result.current.sync(); });
  expect(hook.result.current.storageError).toBe('Войдите снова');
  hook.unmount();
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('unreadable'));
  const broken = renderHook(() => useAccountLibrary(user.id, false));
  await waitFor(() => expect(broken.result.current.storageError).toContain('Не удалось загрузить'));
  expect(broken.result.current.ready).toBe(false);
  broken.unmount();
});
