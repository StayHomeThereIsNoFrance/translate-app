import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function PrivacyPage() {
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Данные и конфиденциальность</Text>
    <Text style={styles.copy}>Thai AI Translate · Обновлено 19 сентября 2026</Text>
    <Text style={styles.copy}>Для перевода введённый текст отправляется на сервер приложения и в сервис ИИ. Сервер сохраняет результаты в кеше, чтобы повторные запросы выполнялись быстрее.</Text>
    <Text style={styles.copy}>Без входа история и избранное хранятся в приложении или браузере на вашем устройстве. При входе через Google мы получаем идентификатор аккаунта, имя и email. Приложение не запрашивает доступ к Gmail, Google Drive или контактам.</Text>
    <Text style={styles.copy}>После входа история и избранное с устройства копируются в ваш аккаунт. На сервере сохраняются исходные тексты, переводы, произношение, настройки запросов и отметки избранного для синхронизации между устройствами. На устройстве остаётся копия и очередь ещё не отправленных изменений.</Text>
    <Text style={styles.copy}>Сессия входа действует до 30 дней. В веб-версии для неё используется защищённый cookie, в мобильном приложении — защищённое хранилище устройства. Выход завершает текущую сессию, но не удаляет сохранённые переводы аккаунта.</Text>
    <Text style={styles.copy}>Для удаления данных аккаунта или вопросов о конфиденциальности напишите владельцу приложения: extazzy@gmail.com. Локальные копии можно удалить очисткой данных приложения или сайта в браузере.</Text>
    <Link href="/" style={styles.link}>Вернуться к переводчику</Link>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#172b3a' },
  copy: { fontSize: 16, lineHeight: 25, color: '#42586b' },
  link: { fontSize: 16, color: '#1558b0', paddingVertical: 12 },
});
