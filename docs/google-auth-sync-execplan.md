# Google login and cross-device translation library

This living ExecPlan follows docs/PLANS.md and builds on docs/device-library-execplan.md. Keep progress, decisions, discoveries and outcomes current.

## Purpose / Big Picture

Users can sign in with Google on the website and Android, then see the same history and favorites. Guest use stays available. Local guest translations are copied into the account without replacing its existing library. Offline account changes wait on the device and retry. Logging out returns to the separate guest collection.

## Progress

- [x] (2026-09-19) Inspected existing device library, API, deployment settings and Expo 57/Google documentation. Created codex/google-auth-sync from the deployed history feature.
- [x] (2026-09-19) Implement persistent account/authentication and synchronized library API with security tests.
- [x] (2026-09-19) Implement web/Android login, account-local cache, durable change queue, merge and UI. Unit suites pass (43 API, 37 client), lint and typecheck pass.
- [x] (2026-09-19) Run tests (85 passed), lint, types, production web/API builds and deployment-policy checks.
- [x] (2026-09-19) Deploy through Coolify MCP and verify with isolated agent-browser. Deployment zyl1hznsplgvg67hmy9ftcda finished with healthy container at 11:58 UTC, commit 37fb1055fb5819d6f1e0d504761f7f034fff0fd7.
- [x] (2026-09-19) Configure Google client, runtime secrets, branding, public privacy URL and publish external audience (Google confirms In production).
- [x] (2026-09-19) Verify real Google sign-in on web, guest import, session persistence after reload, server-backed favorite additions/removals, public privacy page, guest persistence and desktop/mobile layout.
- [x] (2026-09-19) Verify downloadable APK 1.2.0/versionCode 3 and registered thaitranslate callback scheme. Real Android-device sign-in remains unverified: ADB reports no connected phone and user was notified. Native flow and two-client synchronization passed automated tests; these are not claimed as a real-device run.

## Surprises & Discoveries

The user authorized creating the Google client through personal Chrome. Created project Thai AI Translate (rich-operand-509111-g7) and Web application OAuth client with redirect URI https://translate.hetz.autismstaking.xyz/api/auth/google/callback. Client credentials and AUTH_PUBLIC_URL/AUTH_DATABASE_PATH are configured runtime-only through Coolify MCP. Confirmed existing persistent /app/data volume. Google branding homepage and privacy URL are saved, external audience is published and real web login is verified. Android registers the thaitranslate URL scheme.

A failed local disk write must not poison subsequent synchronization: its state is never applied, and later flushes continue from the last durable state. A test caught and fixed this rejected-promise queue case. Sync requests carry the expected account ID to reject cookie changes made by another browser tab.

The first production build ycc0ctksubmyrnngfp7evxez failed downloading Maven dependencies (Read timed out). Retrying through Coolify MCP succeeded with the same production inputs; no dependency or code workaround was necessary. The old container continued serving throughout the failed build.

## Decision Log

2026-09-19: Use a server-mediated Google authorization-code flow for both clients. Google redirects to one HTTPS backend callback; Android opens the system browser and receives a one-time code at thaitranslate://auth/callback. Bind that code to a random verifier held by the initiating client (PKCE: a challenge proving that the same client finishes the login). Store Google client secret only on the server. Validate Google ID token signature, issuer, audience, expiry and nonce. Issue our own revocable 30-day sessions; web uses an HttpOnly cookie, native uses SecureStore. Do not request Google API access beyond identity.

2026-09-19: Use SQLite account tables and idempotent operations rather than overwriting an entire remote library. Each request is scoped to the authenticated Google subject. Favorite removals are explicit operations, so stale devices cannot resurrect them by uploading a full snapshot. Last operation received by the server wins for conflicting star changes. Keep 200 history entries; favorites survive history trimming. Scope local account caches and offline queues by user ID, separately from guest storage.

## Outcomes & Retrospective

Backend and client implementation are deployed, Google external audience is in production and real web sign-in is verified. Local guest history/favorites imported into the account, a new translation synced, its star survived reload and removal reached the server. Isolated browser guest data remained separate. Android APK builds and its callback scheme is present, but no phone was available for real native login. Main remains unmerged pending user approval.

## Context and Orientation

apps/api/src/app.ts builds the Fastify API; config.ts validates environment variables. translation-cache.ts shows the SQLite pattern. packages/contracts/src/index.ts defines shared schemas. apps/client/src/features/translator/library.ts stores guest records, and use-translation-library.ts currently provides screen state. translator-screen.tsx and translation-library.tsx display results and collections. New auth modules belong under apps/client/src/features/account and apps/api/src. Coolify application UUID is ek2k3scxtyw65x3a6csxs0tu, URL https://translate.hetz.autismstaking.xyz.

## Plan of Work

Milestone one adds shared entry/operation/account schemas, SQLite accounts/sessions/login attempts/library storage, and Fastify authentication/sync endpoints. Validate the OAuth flow with injected Google exchange verification in tests; production always uses Google endpoints and signature verification. Tests must reject invalid/expired/replayed states, codes and sessions, cross-user access and malformed input, and exercise persistence and idempotent sync.

Milestone two adds Expo WebBrowser, Crypto and SecureStore using Expo 57-compatible versions. The web client keeps its login verifier in sessionStorage before redirect; native keeps it in memory during openAuthSessionAsync. Exchange the one-time callback code with the verifier, then load the account and sync. Cache account state and pending operations together before attempting network upload. Merge server results with operations added while a request was in flight, retry on focus/interval/manual refresh, and isolate state when accounts change. Show account name, login/logout, pending/error/sync status in an account panel and in the library.

Milestone three validates and deploys. All browser checks use isolated agent-browser against Coolify; do not start local UI. Test guest regressions, two clients of one account, separate accounts, offline changes, unstar propagation and login cancellation. Check mobile layout. Android compilation is part of the production Docker build. Real native sign-in requires installing the APK and completing user authentication; report any unavailable prerequisite honestly.

## Concrete Steps

Run commands from /Users/j/translate-app with PATH=/opt/homebrew/opt/node@24/bin:$PATH. Use pnpm lint, pnpm typecheck, pnpm test:unit and pnpm build. Commit each milestone on codex/google-auth-sync. Run scripts/classify-deployment-change.sh <deployed-sha> HEAD before deployment. Switch Coolify branch only through MCP, push, inspect deployments and start one when needed. Keep documentation/test-only follow-ups out of deployment.

Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_PUBLIC_URL=https://translate.hetz.autismstaking.xyz as runtime variables through Coolify MCP or user-provided configuration. AUTH_DATABASE_PATH defaults to a database adjacent to the translation cache. Confirm the persistent storage covers it. No secret goes in source, client bundles, logs or URLs.

## Validation and Acceptance

A guest still translates, sees history and stars entries. After login on device A, that collection appears for the same Google account on device B. Unstarring on B removes the star on A after sync without losing history. An unrelated account cannot see it. Offline mutations persist through a restart and sync later once. Pending changes made during a sync are retained. Logout isolates account data from guest data. Google cancellation and missing configuration show actionable errors and do not break translation.

## Idempotence and Recovery

SQLite schema changes are additive with CREATE TABLE IF NOT EXISTS. Session and login secrets are random and hashed in persistent storage. OAuth attempts and handoff codes expire after minutes and are consumed once. The device queue uses unique operation IDs; retrying the same upload does not apply a toggle twice. Never delete account databases or guest data during deployment or rollback. Existing device-only keys remain readable. An incomplete credentials setup leaves the guest translator operational.

## Artifacts and Notes

Tests: contracts 5, API 43, client 37; all pass. API statement coverage 94.26%, client 94.55%; lint/typecheck/build and deployment-policy checks pass. Production classification from deployed a9a5dca to b715e40 returns deployment=required apk=rebuild. Coolify branch is codex/google-auth-sync. APK version is 1.2.0, Android versionCode 3.

Live artifacts: https://translate.hetz.autismstaking.xyz, /privacy and /apk. Downloaded APK is 42,905,148 bytes, SHA-256 ff8c92a09844267ecc2f3fe6fac05665af113a18863600942d42a2dd6fddf35e. Inspected isolated screenshots at 390×844 and 1440×1000; no horizontal overflow. Auth session and sync endpoints returned successful results after real Google consent. Temporary screenshots: /tmp/translate-account-mobile.png and /tmp/translate-guest-desktop.png. Documentation-only follow-ups do not require deployment.

## Interfaces and Dependencies

Shared TranslationEntry contains id, createdAt, request and result. LibraryOperation is an identified record/import/favorite change. POST /api/auth/start creates a Google authorization URL for a client challenge; GET /api/auth/google/callback verifies Google and redirects with a short-lived code; POST /api/auth/exchange exchanges the code and verifier for our session. GET /api/auth/session reports user and configuration availability. POST /api/auth/logout revokes the session. POST /api/v1/library/sync applies bounded operations transactionally and returns history/favorites. Use jose for Google signature verification, Expo WebBrowser for external login, Expo Crypto for challenges, Expo SecureStore for native session tokens, and existing AsyncStorage for non-secret account caches.

Revision 2026-09-19: Initial plan, including external Google credential prerequisite and account-isolation/offline semantics.

Revision 2026-09-19: Recorded completed implementation, passing unit checks, user-authorized Google setup and recovery from local storage failures. Personal Chrome is authorized specifically for Google setup and real sign-in; other UI QA stays isolated.

Revision 2026-09-19: Recorded successful production retry, real Google/browser acceptance, APK verification and the explicit physical-device verification limitation.
