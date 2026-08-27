import { Ionicons } from '@expo/vector-icons';
import {
  MAX_TRANSLATION_LENGTH,
  SPEAKER_GENDERS,
  TRANSLATION_MODES,
  type Language,
  type PronunciationWord,
  type SpeakerGender,
  type TranslationMode,
  type TranslationResult,
} from '@thai-translate/contracts';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthRequiredError, login, translate } from './api';
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from './preferences';
import { SegmentedControl } from './segmented-control';

const languageNames: Record<Language, string> = {
  ru: 'Русский',
  th: 'Тайский',
};

function IconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      testID={testID}>
      <Ionicons color="#3c617f" name={icon} size={20} />
    </Pressable>
  );
}

function PinModal({
  visible,
  busy,
  error,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.pinCard}>
          <View style={styles.pinIcon}>
            <Ionicons color="#1a73e8" name="lock-closed" size={24} />
          </View>
          <Text style={styles.pinTitle}>Доступ к переводчику</Text>
          <Text style={styles.pinSubtitle}>
            Введите PIN, заданный для production-сервиса.
          </Text>
          <TextInput
            accessibilityLabel="PIN"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPin}
            onSubmitEditing={() => pin && onSubmit(pin)}
            placeholder="PIN"
            secureTextEntry
            style={styles.pinInput}
            testID="pin-input"
            value={pin}
          />
          {error ? <Text style={styles.pinError}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={!pin || busy}
            onPress={() => onSubmit(pin)}
            style={({ pressed }) => [
              styles.primaryButton,
              (!pin || busy) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
            testID="pin-submit">
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Войти</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SettingsModal({
  onChangeWordTranslations,
  onClose,
  showWordTranslations,
  visible,
}: {
  onChangeWordTranslations: (value: boolean) => void;
  onClose: () => void;
  showWordTranslations: boolean;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.settingsCard}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Настройки</Text>
            <IconButton
              icon="close"
              label="Закрыть настройки"
              onPress={onClose}
              testID="settings-close"
            />
          </View>
          <View style={styles.settingsRow}>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsLabel}>Перевод под словами</Text>
              <Text style={styles.settingsDescription}>
                Показывать английский и русский перевод под произношением
              </Text>
            </View>
            <Switch
              accessibilityLabel="Показывать перевод под словами"
              onValueChange={onChangeWordTranslations}
              thumbColor={showWordTranslations ? '#ffffff' : '#f4f6f8'}
              trackColor={{ false: '#b8c4cf', true: '#1a73e8' }}
              value={showWordTranslations}
              testID="word-translations-switch"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PronunciationWords({
  language,
  showTranslations,
  words,
}: {
  language: 'latin' | 'russian';
  showTranslations: boolean;
  words: PronunciationWord[];
}) {
  return (
    <View style={styles.pronunciationWords} testID={`${language}-pronunciation`}>
      {words.map((word, index) => (
        <View key={`${word.latin}-${index}`} style={styles.pronunciationWord}>
          <Text
            style={styles.pronunciation}
            testID={`${language}-pronunciation-word-${index}`}>
            {language === 'latin' ? word.latin : word.russian}
          </Text>
          {showTranslations ? (
            <Text
              style={styles.wordTranslation}
              testID={`${language}-word-translation-${index}`}>
              {language === 'latin'
                ? word.englishTranslation
                : word.russianTranslation}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function TranslatorScreen() {
  const { width } = useWindowDimensions();
  const desktop = width >= 840;
  const [sourceLanguage, setSourceLanguage] = useState<Language>(
    defaultPreferences.sourceLanguage,
  );
  const [targetLanguage, setTargetLanguage] = useState<Language>(
    defaultPreferences.sourceLanguage === 'ru' ? 'th' : 'ru',
  );
  const [mode, setMode] = useState<TranslationMode>(defaultPreferences.mode);
  const [speakerGender, setSpeakerGender] = useState<SpeakerGender>(
    defaultPreferences.speakerGender,
  );
  const [showWordTranslations, setShowWordTranslations] = useState(
    defaultPreferences.showWordTranslations,
  );
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPreferences().then((preferences) => {
      if (!active) {
        return;
      }
      setMode(preferences.mode);
      setShowWordTranslations(preferences.showWordTranslations);
      setSpeakerGender(preferences.speakerGender);
      setSourceLanguage(preferences.sourceLanguage);
      setTargetLanguage(preferences.sourceLanguage === 'ru' ? 'th' : 'ru');
      setPreferencesLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (preferencesLoaded) {
      void savePreferences({
        mode,
        showWordTranslations,
        speakerGender,
        sourceLanguage,
      });
    }
  }, [mode, preferencesLoaded, showWordTranslations, speakerGender, sourceLanguage]);

  const modeDescription = useMemo(
    () => TRANSLATION_MODES.find((item) => item.id === mode)?.description,
    [mode],
  );

  async function runTranslation() {
    const cleaned = text.trim();
    if (!cleaned || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const translated = await translate({
        text: cleaned,
        sourceLanguage,
        targetLanguage,
        mode,
        speakerGender,
      });
      setResult(translated);
    } catch (translationError) {
      if (translationError instanceof AuthRequiredError) {
        setPendingAfterLogin(true);
        setPinVisible(true);
      } else {
        setError(
          translationError instanceof Error
            ? translationError.message
            : 'Не удалось выполнить перевод',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(pin: string) {
    setPinBusy(true);
    setPinError(null);
    try {
      await login(pin);
      setPinVisible(false);
      if (pendingAfterLogin) {
        setPendingAfterLogin(false);
        await runTranslation();
      }
    } catch (loginError) {
      setPinError(
        loginError instanceof Error ? loginError.message : 'Не удалось войти',
      );
    } finally {
      setPinBusy(false);
    }
  }

  function swapLanguages() {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    if (result) {
      setText(result.translation);
    }
    setResult(null);
    setError(null);
  }

  async function speakThai() {
    if (!result?.thaiText) {
      return;
    }
    await Speech.stop();
    Speech.speak(result.thaiText, {
      language: 'th-TH',
      pitch: 1,
      rate: 0.82,
    });
  }

  async function copyResult() {
    if (!result) {
      return;
    }
    await Clipboard.setStringAsync(result.translation);
    setCopied(true);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.brandMark}>
              <Text style={styles.brandThai}>ก</Text>
            </View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>Thai AI Translate</Text>
              <Text style={styles.brandSubtitle}>Русский ↔ Тайский</Text>
            </View>
            <IconButton
              icon="settings-outline"
              label="Открыть настройки"
              onPress={() => setSettingsVisible(true)}
              testID="settings-button"
            />
          </View>

          <View style={styles.controlsCard}>
            <SegmentedControl
              label="Режим перевода"
              onChange={setMode}
              options={TRANSLATION_MODES}
              testID="mode-control"
              value={mode}
            />
            <SegmentedControl
              label="Пол говорящего"
              onChange={setSpeakerGender}
              options={SPEAKER_GENDERS}
              testID="gender-control"
              value={speakerGender}
            />
            <View style={styles.modeHint}>
              <Ionicons color="#6a7d90" name="sparkles-outline" size={16} />
              <Text style={styles.modeHintText}>{modeDescription}</Text>
            </View>
          </View>

          <View style={styles.languageBar}>
            <View style={styles.languageLabel}>
              <Text style={styles.languageText}>
                {languageNames[sourceLanguage]}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Поменять языки местами"
              accessibilityRole="button"
              onPress={swapLanguages}
              style={({ pressed }) => [
                styles.swapButton,
                pressed && styles.pressed,
              ]}
              testID="swap-languages">
              <Ionicons color="#1a73e8" name="swap-horizontal" size={22} />
            </Pressable>
            <View style={[styles.languageLabel, styles.languageLabelTarget]}>
              <Text style={styles.languageText}>
                {languageNames[targetLanguage]}
              </Text>
            </View>
          </View>

          <View style={[styles.translationGrid, desktop && styles.gridDesktop]}>
            <View style={[styles.translationCard, desktop && styles.cardDesktop]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardEyebrow}>Исходный текст</Text>
                {text ? (
                  <IconButton
                    icon="close"
                    label="Очистить текст"
                    onPress={() => {
                      setText('');
                      setResult(null);
                      setError(null);
                    }}
                    testID="clear-input"
                  />
                ) : null}
              </View>
              <TextInput
                accessibilityLabel="Текст для перевода"
                maxLength={MAX_TRANSLATION_LENGTH}
                multiline
                onChangeText={setText}
                onSubmitEditing={() => void runTranslation()}
                placeholder={
                  sourceLanguage === 'ru'
                    ? 'Введите текст на русском'
                    : 'ใส่ข้อความภาษาไทย'
                }
                placeholderTextColor="#97a3af"
                returnKeyType="send"
                style={styles.translationInput}
                submitBehavior="blurAndSubmit"
                testID="translation-input"
                textAlignVertical="top"
                value={text}
              />
              <View style={styles.inputFooter}>
                <Text style={styles.characterCount}>
                  {text.length} / {MAX_TRANSLATION_LENGTH}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!text.trim() || loading}
                  onPress={() => void runTranslation()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (!text.trim() || loading) && styles.buttonDisabled,
                    pressed && styles.pressed,
                  ]}
                  testID="translate-button">
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons color="#ffffff" name="language" size={18} />
                      <Text style={styles.primaryButtonText}>Перевести</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            <View
              style={[
                styles.translationCard,
                styles.resultCard,
                desktop && styles.cardDesktop,
              ]}
              testID="translation-result-card">
              <View style={styles.cardHeader}>
                <Text style={styles.cardEyebrow}>Перевод</Text>
                {result ? (
                  <View style={styles.resultActions}>
                    <IconButton
                      icon="volume-high-outline"
                      label="Озвучить тайский текст"
                      onPress={() => void speakThai()}
                      testID="speak-result"
                    />
                    <IconButton
                      icon={copied ? 'checkmark' : 'copy-outline'}
                      label="Скопировать перевод"
                      onPress={() => void copyResult()}
                      testID="copy-result"
                    />
                  </View>
                ) : null}
              </View>

              {result ? (
                <View style={styles.resultContent}>
                  <Text style={styles.translationOutput} testID="translation-output">
                    {result.translation}
                  </Text>
                  <View style={styles.divider} />
                  <View style={styles.resultSection}>
                    <Text style={styles.resultLabel}>Тайское написание</Text>
                    <Text style={styles.thaiText} testID="thai-text">
                      {result.thaiText}
                    </Text>
                  </View>
                  <View style={styles.pronunciationRow}>
                    <View style={styles.pronunciationItem}>
                      <Text style={styles.resultLabel}>Произношение EN</Text>
                      <PronunciationWords
                        language="latin"
                        showTranslations={showWordTranslations}
                        words={result.pronunciation.words}
                      />
                    </View>
                    <View style={styles.pronunciationItem}>
                      <Text style={styles.resultLabel}>Произношение RU</Text>
                      <PronunciationWords
                        language="russian"
                        showTranslations={showWordTranslations}
                        words={result.pronunciation.words}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyResult}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      color="#8ba5bd"
                      name="chatbubbles-outline"
                      size={34}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>Перевод появится здесь</Text>
                  <Text style={styles.emptySubtitle}>
                    Вместе с тайским написанием и двумя вариантами произношения
                  </Text>
                </View>
              )}
            </View>
          </View>

          {error ? (
            <View accessibilityRole="alert" style={styles.errorBanner}>
              <Ionicons color="#b3261e" name="alert-circle" size={20} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void runTranslation()} testID="retry-button">
                <Text style={styles.retryText}>Повторить</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.footer}>
            ИИ может ошибаться — проверяйте важные сообщения перед отправкой.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <PinModal
        busy={pinBusy}
        error={pinError}
        onSubmit={(pin) => void submitPin(pin)}
        visible={pinVisible}
      />
      <SettingsModal
        onChangeWordTranslations={setShowWordTranslations}
        onClose={() => setSettingsVisible(false)}
        showWordTranslations={showWordTranslations}
        visible={settingsVisible}
      />
    </SafeAreaView>
  );
}

/* istanbul ignore next -- appearance is verified by web and Android E2E */
const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    backgroundColor: '#f6f8fc',
    flex: 1,
  },
  page: {
    alignSelf: 'center',
    maxWidth: 1180,
    paddingBottom: 30,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 24 : 12,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  brandCopy: {
    flex: 1,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    width: 46,
  },
  brandThai: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '700',
    marginTop: -2,
  },
  brandTitle: {
    color: '#172b3a',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    color: '#708090',
    fontSize: 13,
    marginTop: 2,
  },
  controlsCard: {
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#31546d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  modeHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 4,
  },
  modeHintText: {
    color: '#6a7d90',
    fontSize: 13,
  },
  languageBar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 58,
    overflow: 'hidden',
  },
  languageLabel: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  languageLabelTarget: {
    backgroundColor: '#f8fbff',
  },
  languageText: {
    color: '#1558b0',
    fontSize: 15,
    fontWeight: '700',
  },
  swapButton: {
    alignItems: 'center',
    backgroundColor: '#eef5ff',
    borderRadius: 22,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  translationGrid: {
    gap: 10,
  },
  gridDesktop: {
    flexDirection: 'row',
  },
  translationCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 330,
    overflow: 'hidden',
    padding: 18,
    shadowColor: '#31546d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  cardDesktop: {
    flex: 1,
    minHeight: 390,
  },
  resultCard: {
    backgroundColor: '#fbfdff',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  cardEyebrow: {
    color: '#607385',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#edf4fb',
    borderRadius: 20,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.98 }],
  },
  translationInput: {
    color: '#1e2d3a',
    flex: 1,
    fontSize: 22,
    lineHeight: 32,
    minHeight: 190,
    paddingHorizontal: 0,
    paddingTop: 14,
  },
  inputFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  characterCount: {
    color: '#8a98a5',
    fontSize: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 126,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#afc8e6',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
  },
  resultContent: {
    flex: 1,
    paddingTop: 12,
  },
  translationOutput: {
    color: '#172b3a',
    fontSize: 24,
    fontWeight: '500',
    lineHeight: 34,
  },
  divider: {
    backgroundColor: '#e5ebf1',
    height: 1,
    marginVertical: 18,
  },
  resultSection: {
    gap: 7,
  },
  resultLabel: {
    color: '#75879a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  thaiText: {
    color: '#1359ad',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 36,
  },
  pronunciationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  pronunciationItem: {
    backgroundColor: '#f0f6fd',
    borderRadius: 12,
    flexGrow: 1,
    gap: 6,
    minWidth: 180,
    padding: 12,
  },
  pronunciation: {
    color: '#314a5e',
    fontSize: 16,
    lineHeight: 23,
  },
  pronunciationWords: {
    alignItems: 'flex-start',
    columnGap: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  pronunciationWord: {
    alignItems: 'flex-start',
    maxWidth: 126,
  },
  wordTranslation: {
    color: '#7890a5',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  emptyResult: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#edf4fb',
    borderRadius: 31,
    height: 62,
    justifyContent: 'center',
    marginBottom: 15,
    width: 62,
  },
  emptyTitle: {
    color: '#455b6c',
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#8493a1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 330,
    textAlign: 'center',
  },
  errorBanner: {
    alignItems: 'center',
    backgroundColor: '#fff2f0',
    borderColor: '#f5c6c2',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    padding: 13,
  },
  errorText: {
    color: '#8c2b24',
    flex: 1,
    fontSize: 14,
  },
  retryText: {
    color: '#a83229',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    color: '#8a98a5',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 35, 49, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  pinCard: {
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxWidth: 380,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    width: '100%',
  },
  pinIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#e8f1fd',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    marginBottom: 14,
    width: 50,
  },
  pinTitle: {
    color: '#172b3a',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  pinSubtitle: {
    color: '#708090',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    marginTop: 7,
    textAlign: 'center',
  },
  pinInput: {
    borderColor: '#cad6e2',
    borderRadius: 12,
    borderWidth: 1,
    color: '#172b3a',
    fontSize: 18,
    marginBottom: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  pinError: {
    color: '#b3261e',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxWidth: 480,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    width: '100%',
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  settingsTitle: {
    color: '#172b3a',
    fontSize: 20,
    fontWeight: '700',
  },
  settingsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
  },
  settingsCopy: {
    flex: 1,
  },
  settingsLabel: {
    color: '#314a5e',
    fontSize: 15,
    fontWeight: '700',
  },
  settingsDescription: {
    color: '#75879a',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
