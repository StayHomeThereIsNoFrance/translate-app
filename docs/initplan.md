# Thai AI Translate: Android + Web

## Summary

- Создать новый pnpm/TypeScript workspace на Expo SDK 57 с Expo Router, React Native и общим UI для Android/Web. SDK 57 требует Node ≥22.13 и Android compile/target SDK 36; закрепить Node 24 LTS. [Expo setup](https://docs.expo.dev/get-started/create-a-project/), [SDK matrix](https://docs.expo.dev/versions/latest/).
- Добавить отдельный Fastify API/BFF: только он хранит ключ и обращается к `http://cliproxyapi:8317/v1/responses`; ключ никогда не попадает в web/APK.
- Название: `Thai AI Translate`, Android package: `xyz.autismstaking.thaitranslate`.
- Первая версия поддерживает только `Русский ↔ Тайский`; интерфейс русский.

## Implementation Changes

- Сделать адаптивный интерфейс в стиле Google Translate без копирования брендинга: белый фон, синий акцент, две колонки на desktop и одна на Android.
- Добавить смену направления `Русский → Тайский` / `Тайский → Русский`, переключатели режима `Farang - Ploy` / `Thai formal`, пола `Мужчина` / `Женщина`, поле ввода, очистку, перевод, копирование и состояния загрузки/ошибки.
- Результат содержит:
  - итоговый перевод;
  - тайское написание;
  - произношение латиницей;
  - произношение русскими буквами;
  - кнопку Thai TTS через `expo-speech` с языком `th-TH`. Библиотека поддерживает Android и Web. [Expo Speech](https://docs.expo.dev/versions/v57.0.0/sdk/speech/).
- Сохранять выбранные режим, пол и языки локально; историю переводов и серверную БД не добавлять.
- Пол влияет только на генерируемую тайскую речь: `ครับ` для мужчины, `ค่ะ` для утверждения и `คะ` для вопроса у женщины; частицы добавляются естественно, а не механически к каждой фразе.
- `Farang - Ploy` создаёт живой, тёплый, разговорный стиль без добавления флирта или интимного смысла, отсутствующего в оригинале. `Thai formal` создаёт уважительный нейтральный текст для незнакомых, старших и делового общения.
- Полные системные промпты хранить только в `config/prompts/farang-ploy.md` и `config/prompts/thai-formal.md`; сервер загружает и валидирует их при старте. Изменения применяются после рестарта/деплоя. Просмотр и редактирование промптов через UI не добавлять.
- Публичный контракт:
  - `POST /api/v1/session` — проверка общего PIN и выдача сессии;
  - `POST /api/v1/translate` принимает `{ text, sourceLanguage, targetLanguage, mode, speakerGender }`;
  - ответ: `{ translation, thaiText, pronunciation: { latin, russian }, requestId }`;
  - `GET /healthz` — проверка процесса.
- Ограничить текст 2000 символами, разрешить только пары с тайским на одной стороне, добавить rate limit, CORS для локальной разработки, безопасные cookie для web и bearer-токен в SecureStore для Android. В production API не запускается без `APP_ACCESS_PIN` и `SESSION_SECRET`.
- Использовать `gpt-5.6-terra`, `reasoning: none`, `store: false` и строгий JSON Schema; результат дополнительно проверять Zod. Модель и effort остаются настраиваемыми через env.
- Локальный Docker Compose подключает API к внешней сети `agent-docker_agent-internal`. Для production создать отдельный проект `thai-ai-translate` в Coolify и подключить его к сети `coolify`, где уже находится `cliproxyapi`. Сайт и API обслуживаются одним контейнером и одним origin.
- Описать компоненты, API, поток данных, безопасность, промпты, Docker/Coolify и тестовую стратегию в `docs/Architecture.md`.

## Test Plan

- Jest + `jest-expo` и React Native Testing Library: компоненты, состояния формы, выбор режима/пола, TTS и ошибки клиента. Vitest проверяет prompt renderer, схемы API, ошибки proxy и правильные частицы. Минимальный coverage — 80% по statements/branches/functions/lines. [Expo testing](https://docs.expo.dev/develop/unit-testing/).
- Интеграционные тесты API используют локальный stub Responses API и проверяют фактический outbound prompt, модель, JSON Schema, таймауты и отсутствие ключа в клиентских данных.
- Playwright запускает web-приложение в desktop и mobile viewport: ввод фразы, переключение режимов, перевод, проверка четырёх полей, копирование, TTS и ошибки.
- Maestro сохраняет детерминированный сценарий на эмуляторе и добавляет обязательный physical-device smoke на Samsung Galaxy S22+ (`SM-S906*`) по wireless ADB. Команда `pnpm test:e2e:android:s22` должна явно выбрать этот телефон, собрать и установить APK с production HTTPS API, очистить состояние приложения, выбрать `Thai formal` и мужской пол, перевести `Спасибо`, проверить `ขอบคุณครับ` и наличие обеих транслитераций. Pairing выполняется один раз через `pnpm android:s22:pair -- HOST:PAIR_PORT`; IP и pairing-код не сохраняются в репозитории. [Expo local Android build](https://docs.expo.dev/guides/local-app-development/), [Expo Maestro E2E](https://docs.expo.dev/eas/workflows/examples/e2e-tests/).
- Основные E2E используют детерминированный proxy stub. Отдельный `test:live` обращается к настоящему `cliproxyapi` и проверяет эталонные фразы, тайский алфавит, обязательные/запрещённые gender particles и непустые транслитерации без сравнения всей недетерминированной строки.

## Tooling and Delivery

- Установить Node 24 LTS, Android SDK Platform/Build Tools 36, Maestro CLI и Playwright Chromium; использовать JDK 17 из Android Studio и существующий API 34 emulator.
- Добавить команды `lint`, `typecheck`, `test:unit`, `test:e2e:web`, `test:e2e:android`, `test:live`, `build:web`, `build:android` и объединяющую `verify`.
- Собрать web production bundle, Docker image и локальный preview APK, прогнать детерминированный Maestro flow на эмуляторе, затем автоматически установить текущий arm64 APK на Galaxy S22+ командой `pnpm deploy:android:s22` и прогнать на нём physical-device flow перевода фразы.
- Опубликовать сайт и API как отдельный проект Coolify на `translate.hetz.autismstaking.xyz`, настроить production secrets, healthcheck, HTTPS и внутренний доступ к контейнеру `cliproxyapi`. Публикация в Google Play остаётся вне первой версии; Android передаётся как проверенный preview APK.
