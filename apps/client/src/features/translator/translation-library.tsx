import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { HISTORY_LIMIT, type TranslationEntry, type TranslationLibrary } from './library';
import { SegmentedControl } from './segmented-control';

export type LibraryTab = 'history' | 'favorites';

export function FavoriteButton({ selected, disabled = false, onPress, testID }: {
  selected: boolean; disabled?: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={selected ? 'Убрать из избранного' : 'Добавить в избранное'}
      accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={[styles.iconButton, selected && styles.starred, disabled && styles.disabled]} testID={testID}>
      <Ionicons name={selected ? 'star' : 'star-outline'} color={selected ? '#a66a00' : '#3c617f'} size={21} />
    </Pressable>
  );
}

export function TranslationLibraryModal({ library, ready, error, tab, onTabChange, onClose, onOpen, onToggle, busy, accountLabel }: {
  library: TranslationLibrary; ready: boolean; error: string | null; tab: LibraryTab | null;
  onTabChange: (tab: LibraryTab) => void; onClose: () => void;
  onOpen: (entry: TranslationEntry) => void; onToggle: (entry: TranslationEntry) => void; busy: boolean;
  accountLabel?: string;
}) {
  const entries = tab === 'favorites' ? library.favorites : library.history;
  const favorites = new Set(library.favorites.map((entry) => entry.id));
  return (
    <Modal visible={tab !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Мои переводы</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть мои переводы" onPress={onClose} style={styles.iconButton} testID="library-close">
              <Ionicons name="close" color="#3c617f" size={22} />
            </Pressable>
          </View>
          <SegmentedControl label="Сохранённые переводы" options={[
            { id: 'history', label: 'История' }, { id: 'favorites', label: 'Избранное' },
          ]} value={tab ?? 'history'} onChange={onTabChange} testID="library-tab" />
          <Text style={styles.hint}>{accountLabel ?? 'Только на этом устройстве. Войдите через Google для синхронизации.'}</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {!ready && !error ? <ActivityIndicator accessibilityLabel="Загрузка сохранённых переводов" /> : null}
          {ready ? <FlatList
            style={styles.list} data={entries} keyExtractor={(item) => item.id}
            ListEmptyComponent={<View style={styles.empty}>
              <Ionicons name={tab === 'favorites' ? 'star-outline' : 'time-outline'} size={36} color="#8ba5bd" />
              <Text style={styles.emptyTitle}>{tab === 'favorites' ? 'В избранном пока пусто' : 'История пока пуста'}</Text>
              <Text style={styles.emptyHint}>{tab === 'favorites' ? 'Нажмите звезду рядом с переводом, чтобы сохранить его здесь.' : 'Здесь появятся ваши успешные переводы.'}</Text>
            </View>}
            renderItem={({ item, index }) => <View style={styles.entry}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Открыть перевод: ${item.request.text}`} disabled={busy}
                onPress={() => onOpen(item)} style={[styles.entryBody, busy && styles.disabled]} testID={`library-entry-${index}`}>
                <Text style={styles.metadata}>{item.request.sourceLanguage === 'ru' ? 'Русский → Тайский' : 'Тайский → Русский'} · {new Date(item.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                <Text numberOfLines={2} style={styles.source}>{item.request.text}</Text>
                <Text numberOfLines={2} style={styles.translation}>{item.result.translation}</Text>
              </Pressable>
              <FavoriteButton selected={favorites.has(item.id)} onPress={() => onToggle(item)} testID={`library-star-${index}`} />
            </View>}
          /> : null}
          {tab === 'history' && ready && entries.length > 0 ? <Text style={styles.hint}>Последние {HISTORY_LIMIT} переводов. Избранное хранится отдельно.</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 35, 49, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 680, maxHeight: '88%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 21, fontWeight: '700', color: '#172b3a' },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#edf4fb', alignItems: 'center', justifyContent: 'center' },
  starred: { backgroundColor: '#fff4d6' },
  disabled: { opacity: 0.45 },
  hint: { fontSize: 12, lineHeight: 18, color: '#708090' },
  error: { color: '#8c2b24', fontSize: 14 },
  list: { flexGrow: 0, flexShrink: 1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderColor: '#e5ebf1' },
  entryBody: { flex: 1, gap: 5 },
  metadata: { fontSize: 12, color: '#708090' },
  source: { fontSize: 16, color: '#172b3a', fontWeight: '600' },
  translation: { fontSize: 17, lineHeight: 25, color: '#3c617f' },
  empty: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#455b6c', fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#708090', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
});
