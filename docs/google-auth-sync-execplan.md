# Google login and cross-device translation library

This living ExecPlan follows docs/PLANS.md and builds on docs/device-library-execplan.md. Keep progress, decisions, discoveries and outcomes current.

## Purpose / Big Picture

Users can sign in with Google on the website and Android, then see the same history and favorites. Guest use stays available. Local guest translations are copied into the account without replacing its existing library. Offline account changes wait on the device and retry. Logging out returns to the separate guest collection.

## Progress

- [x] (2026-09-19) Inspected existing device library, API, deployment settings and Expo 57/Google documentation. Created codex/google-auth-sync from the deployed history feature.
- [ ] Implement persistent account/authentication and synchronized library API with security tests.
- [ ] Implement web/Android login, account-local cache, durable change queue, merge and UI.
- [ ] Run tests, lint, types and builds; deploy through Coolify MCP and verify with isolated agent-browser.
- [ ] Configure real Google client and verify real sign-in on web and Android where credentials/device access permit.

## Surprises & Discoveries

Coolify currently has no Google OAuth environment variables. The user has been asked to configure a Web application OAuth client with redirect URI https://translate.hetz.autismstaking.xyz/api/auth/google/callback. This is an external prerequisite for real Google login, not for implementation and deterministic tests. The backend already uses SQLite and a persistent /app/data volume. Android already registers the thaitranslate URL scheme.

## Decision Log

2026-09-19: Use a server-mediated Google authorization-code flow for both clients. Google redirects to one HTTPS backend callback; Android opens the system browser and receives a one-time code at thaitranslate://auth/callback. Bind that code to a random verifier held by the initiating client (PKCE: a challenge proving that the same client finishes the login). Store Google client secret only on the server. Validate Google ID token signature, issuer, audience, expiry and nonce. Issue our own revocable 30-day sessions; web uses an HttpOnly cookie, native uses SecureStore. Do not request Google API access beyond identity.

2026-09-19: Use SQLite account tables and idempotent operations rather than overwriting an entire remote library. Each request is scoped to the authenticated Google subject. Favorite removals are explicit operations, so stale devices cannot resurrect them by uploading a full snapshot. Last operation received by the server wins for conflicting star changes. Keep 200 history entries; favorites survive history trimming. Scope local account caches and offline queues by user ID, separately from guest storage.

## Outcomes & Retrospective

Pending implementation. Main will not be merged without approval. Missing Google credentials will be reported explicitly if still unavailable at delivery; mock-provider tests cannot substitute for real Google verification.

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

Record tests, deployment SHA, screenshots and external blockers here as work progresses.

## Interfaces and Dependencies

Shared TranslationEntry contains id, createdAt, request and result. LibraryOperation is an identified record/import/favorite change. POST /api/auth/start creates a Google authorization URL for a client challenge; GET /api/auth/google/callback verifies Google and redirects with a short-lived code; POST /api/auth/exchange exchanges the code and verifier for our session. GET /api/auth/session reports user and configuration availability. POST /api/auth/logout revokes the session. POST /api/v1/library/sync applies bounded operations transactionally and returns history/favorites. Use jose for Google signature verification, Expo WebBrowser for external login, Expo Crypto for challenges, Expo SecureStore for native session tokens, and existing AsyncStorage for non-secret account caches.

Revision 2026-09-19: Initial plan, including external Google credential prerequisite and account-isolation/offline semantics.
