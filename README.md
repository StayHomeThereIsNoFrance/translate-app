# Thai AI Translate

Universal Russian ↔ Thai AI translator for Android and web.

Production: [translate.hetz.autismstaking.xyz](https://translate.hetz.autismstaking.xyz)

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
pnpm build:android
```

Architecture and deployment details are in `docs/Architecture.md`.

`build:android` creates an `arm64-v8a` preview APK. Use
`pnpm --filter @thai-translate/client build:android:universal` only when a
four-ABI APK is required.

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

After pairing, one command builds an arm64 release APK for the production HTTPS
API, installs it as an update on the online `SM-S906*` Galaxy S22+, and opens it:

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

The script refuses to select an emulator or unrelated phone. If multiple S22+
devices are online, set `ANDROID_DEVICE_SERIAL` to the exact serial printed by
`adb devices -l`. For `unauthorized` or `offline`, accept the phone prompt,
toggle Wireless debugging, and repeat pairing or `android:s22:connect` with the
current port.
