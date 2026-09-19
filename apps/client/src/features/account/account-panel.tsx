import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccount } from './account-context';

export function AccountPanel({ visible, onClose, pending, syncing, lastSynced, syncError, onSync }: {
  visible: boolean; onClose: () => void; pending: number; syncing: boolean;
  lastSynced: string | null; syncError: string | null; onSync: () => void;
}) {
  const account = useAccount();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Аккаунт</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть аккаунт" onPress={onClose} style={styles.close} testID="account-close">
          <Ionicons name="close" color="#3c617f" size={22} />
        </Pressable>
      </View>
      {account.user ? <>
        <Text style={styles.name}>{account.user.name}</Text>
        <Text style={styles.copy}>{account.user.email}</Text>
        <Text style={styles.copy}>История и избранное синхронизируются на устройствах с этим Google-аккаунтом.</Text>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>{syncing ? 'Синхронизация…' : pending ? `Ожидают отправки: ${pending}` : lastSynced ? `Синхронизировано в ${lastSynced}` : 'Подключение к синхронизации…'}</Text>
        <Pressable accessibilityRole="button" disabled={syncing || account.busy} onPress={onSync} style={styles.secondary} testID="sync-now"><Text style={styles.blue}>Синхронизировать сейчас</Text></Pressable>
      </> : <>
        <Text style={styles.name}>Ваши переводы — на всех устройствах</Text>
        <Text style={styles.copy}>Войдите через Google, чтобы объединить историю и избранное с аккаунтом и открыть их на телефоне или компьютере.</Text>
        <Text style={styles.copy}>Без входа переводы сохраняются только на этом устройстве.</Text>
      </>}
      {account.error || syncError ? <Text accessibilityRole="alert" style={styles.error}>{account.error || syncError}</Text> : null}
      {account.available === false ? <Text style={styles.copy}>Вход через Google пока не настроен. Гостевой режим доступен.</Text> : null}
      {account.loading || account.busy ? <ActivityIndicator accessibilityLabel="Подключение аккаунта" /> : null}
      <Pressable accessibilityRole="button" disabled={account.loading || account.busy} onPress={() => void account.login()}
        style={styles.google} testID="google-login">
        <Text style={styles.googleText}>{account.user ? 'Войти в другой Google-аккаунт' : 'Войти через Google'}</Text>
      </Pressable>
      {account.user ? <Pressable accessibilityRole="button" disabled={account.busy} onPress={() => void account.logout()} style={styles.secondary} testID="account-logout">
        <Text style={styles.blue}>Выйти из аккаунта</Text>
      </Pressable> : null}
      <Link href="./privacy" onPress={onClose} style={styles.blue}>Данные и конфиденциальность</Link>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(20,35,49,0.5)' },
  card: { width: '100%', maxWidth: 480, backgroundColor: 'white', padding: 22, borderRadius: 20, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#edf4fb' },
  title: { fontSize: 22, fontWeight: '700', color: '#172b3a' },
  name: { fontSize: 18, fontWeight: '600', color: '#172b3a' },
  copy: { fontSize: 14, lineHeight: 21, color: '#607385' },
  error: { fontSize: 14, lineHeight: 21, color: '#8c2b24' },
  google: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#c8d2dd', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  googleText: { color: '#1f1f1f', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  blue: { color: '#1558b0', fontSize: 14, textAlign: 'center' },
});
