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
