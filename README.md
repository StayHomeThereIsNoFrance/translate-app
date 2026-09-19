# Thai AI Translate

Universal Russian ↔ Thai AI translator for Android and web.

Production: [translate.hetz.autismstaking.xyz](https://translate.hetz.autismstaking.xyz)

Android APK: [translate.hetz.autismstaking.xyz/apk](https://translate.hetz.autismstaking.xyz/apk)

## Local development

Requirements are Node 24, pnpm 10, Java 17, Android SDK 36, Docker, Playwright,
and Maestro.

```bash
pnpm install
pnpm dev:api
pnpm dev:web
```

The API reads `CLIPROXYAPI_API_KEY` and other server values from the process
environment. See `.env.example`. The web development server expects the API at
`http://localhost:3000`.

## Verification

```bash
pnpm verify
pnpm test:live
pnpm build:apk
```

Architecture and deployment details are in `docs/Architecture.md`.

## History and favorites

The client automatically keeps the latest 200 successful requests in **История**.
Use the star on a result or history entry to add it to **Избранное**; press the
star again to remove it. Favorites remain saved when older history entries expire.
Open a saved entry to restore its text, languages, mode, speaker gender, result,
and pronunciation without another translation request.

Collections use AsyncStorage on the current app installation, or storage for the
current browser profile and site origin on web. They survive reloads and app
restarts and require no account. In guest mode they stay on that device. Clearing
app/site data removes local data. Storage failures display a warning.

Sign in through Google in the account panel to synchronize history and favorites
between web and Android. Existing guest entries are copied into the account once
per device. Account caches and offline queues are separate from guest data and
from other accounts. Changes retry on focus, every 30 seconds, and on manual sync.
Logout returns to the guest collection; queued account changes remain available
when that same account signs in again. Conflicting star changes use the last
operation received by the server.

## Google sign-in setup

Create a Google OAuth **Web application** client with redirect URI
`https://translate.hetz.autismstaking.xyz/api/auth/google/callback`. Both web and
Android use this server callback; Android then returns via `thaitranslate://auth/callback`.
Configure runtime-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`AUTH_PUBLIC_URL` (the HTTPS site origin). Never put the secret in Expo public
variables. Set `AUTH_DATABASE_PATH=/app/data/accounts.sqlite` on production and
persist `/app/data`, including SQLite journals. Back up this database with the
same SQLite-aware procedure as the translation cache.

Google consent uses only `openid email profile`. Configure the public homepage
and `/privacy` URL in Google Auth Platform and publish the external audience.
Without Google credentials, translation and device-only collections still work.
Web sessions use an HttpOnly Secure cookie; Android sessions use SecureStore.
Sessions expire after 30 days and logout revokes the current session.

## Server translation cache

The API stores successful translations in SQLite at `TRANSLATION_CACHE_PATH`
(default: `./data/translations.sqlite`, relative to the process working directory).
Repeated requests reuse the entire result, including pronunciation and word
translations. The key includes trimmed text, source and target languages, mode,
speaker gender, provider URL, model, reasoning effort, and prompt contents.
Case, punctuation, and internal whitespace remain significant.

Simultaneous identical requests in one server process share one provider call.
Errors are not cached; each HTTP response retains its own request ID. Entries
have no automatic expiry or eviction and survive server restarts. Changes to
model configuration or prompts select a fresh cache namespace. SQLite uses WAL
mode; back up the database using a SQLite-aware tool, or stop the server before
copying its data directory. Disk usage grows with the number of unique requests.

Both Compose files mount a named volume at `/app/data`. For a Coolify Dockerfile
application, configure persistent storage at `/app/data` before deploying; the
image uses `/app/data/translations.sqlite`. Persist the whole directory, including
SQLite's journal files, so container replacement retains translations. Tests use
isolated temporary databases or the explicit `:memory:` path.

`build:apk` creates `dist/apk/thai-ai-translate.apk`, prints its byte count and
SHA-256, and targets the production HTTPS API by default. The lower-level
`build:android` command leaves Gradle's output in the generated native project.
Use `pnpm --filter @thai-translate/client build:android:universal` only when a
four-ABI APK is required.

## APK download and Coolify publishing

Every production Docker build runs `scripts/build-apk.sh` in a dedicated Debian
Android toolchain stage. The final Alpine image receives only the generated APK
at `/app/web/thai-ai-translate.apk`; Java, Android SDK, NDK, CMake, and generated
native sources stay outside the runtime image. Fastify serves the artifact from
the stable direct download route:

```text
https://translate.hetz.autismstaking.xyz/apk
```

The route returns the Android APK media type and downloads the file as
`thai-ai-translate.apk`. Docker gives the APK stage a deliberately narrow input
set: client sources/assets, shared contracts, dependency metadata, and the APK
build script. API-only deployments reuse the cached APK and do not run Gradle.
Client or shared-contract changes rebuild and replace it. A cold Android build
is substantially slower because Gradle must compile React Native; Docker caches
the pinned Android toolchain, pnpm store, and Gradle dependencies for later
builds.

Coolify automatic deployments are limited to production inputs by the watch
paths recorded in `config/deployment/coolify-watch-paths.txt`. Documentation,
plans, tests, and local tooling do not deploy. Before a manual handoff or merge,
classify the difference:

```bash
scripts/classify-deployment-change.sh BASE HEAD
```

The final line reports whether no deployment is needed, a server deployment can
reuse the APK, or an APK rebuild is required. If an approved feature revision is
already running and its tree is identical to the merge commit on `main`, switch
the Coolify source branch to `main` without deploy, redeploy, or restart.

This is an `arm64-v8a` sideloadable preview signed with the generated preview
key. It is suitable for the existing Galaxy S22+ workflow, but it is not a
Google Play release artifact. A Play release requires a separately managed
upload key and normally an Android App Bundle (`.aab`).

For local output or a non-production API origin, use the non-secret overrides:

```bash
APK_OUTPUT_PATH=dist/apk/custom.apk \
EXPO_PUBLIC_API_BASE_URL=https://example.test \
pnpm build:apk
```

## Galaxy S22+ wireless deployment and E2E

The Mac and phone must be on the same Wi-Fi network. One-time phone setup:

1. On the phone, open **Settings > About phone > Software information** and tap
   **Build number** seven times. Then enable **Settings > Developer options >
   Wireless debugging**.
2. Open **Pair device with pairing code** and pass its temporary address to the
   repository command. Enter the six-digit code only when ADB prompts for it:

   ```bash
   pnpm android:s22:pair -- 192.168.1.X:PAIRING_PORT
   ```

3. Check the target. If automatic discovery did not connect it, use the
   different address and port shown on the main **Wireless debugging** screen:

   ```bash
   pnpm android:s22:connect -- 192.168.1.X:CONNECTION_PORT
   pnpm android:s22:status
   ```

After pairing, one command uses the same APK build script as Coolify, installs
the arm64 production-API build as an update on the online `SM-S906*` Galaxy
S22+, and opens it:

```bash
pnpm deploy:android:s22
```

Keep the phone unlocked during installation. Google Play Protect can require a
one-time confirmation for a locally signed preview APK; approve **Install
anyway** on the phone. The script does not disable or bypass this protection.

The physical-device E2E starts from cleared app state, translates `Спасибо` in
Thai formal mode as a male speaker, checks `ขอบคุณครับ`, and confirms both
pronunciation sections are visible:

```bash
pnpm test:e2e:android:s22
```

Start the command with the phone unlocked. During the build and test, the
script temporarily extends the screen timeout to ten minutes and restores the
previous value when it exits, so Android cannot sleep halfway through Maestro
startup.

The script refuses to select an emulator or unrelated phone. If multiple S22+
devices are online, set `ANDROID_DEVICE_SERIAL` to the exact serial printed by
`adb devices -l`. For `unauthorized` or `offline`, accept the phone prompt,
toggle Wireless debugging, and repeat pairing or `android:s22:connect` with the
current port.
