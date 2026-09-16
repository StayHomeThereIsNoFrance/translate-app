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
`thai-ai-translate.apk`. Deploying a new Git revision through Coolify rebuilds
and replaces the artifact together with the web/API container. The first cold
deployment is substantially slower than a web-only build because Gradle must
compile React Native; Docker caches the pinned Android toolchain and Gradle
dependencies for later builds.

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
