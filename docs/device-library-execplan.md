# Device-local translation history and favorites

This living plan follows docs/PLANS.md.

## Purpose / Big Picture

Successful translations should remain available after reopening the app. Users can star a translation, browse history and favorites separately, and reopen a saved result including pronunciation without another API request. Data belongs to this app installation or browser origin on the current device.

## Progress

- [x] (2026-09-17) Inspected client, contracts, storage, tests, and Expo 57 documentation; created codex/device-history-favorites.
- [ ] Implement validated local storage and focused persistence tests.
- [ ] Integrate library views and star actions with screen tests.
- [ ] Run lint, types, unit tests and build; deploy branch via Coolify MCP and verify with isolated agent-browser.

## Surprises & Discoveries

AsyncStorage is already installed for preferences, so no dependency or backend change is required. The result includes pronunciation and a request ID; request settings must be saved alongside it, since screen controls can change while a request is pending.

## Decision Log

2026-09-17: Save successful requests, not failed attempts, with full request/result snapshots and timestamps. Retain the most recent 200 history entries and keep favorites independently so history eviction cannot delete them. Use existing AsyncStorage with a versioned key, validate saved records using contract schemas, serialize writes, and surface storage failures without hiding a successful translation. Display separate library tabs in a modal to keep the translator uncluttered. No account or server synchronization is added.

## Outcomes & Retrospective

Implementation and verification are pending. Main stays unchanged until user approval under AGENTS.md.

## Context and Orientation

apps/client/src/features/translator/translator-screen.tsx owns translation requests and UI. preferences.ts demonstrates device storage. packages/contracts/src/index.ts defines request/result validators. Client Jest tests live under apps/client/src/features/translator/__tests__. Coolify application ek2k3scxtyw65x3a6csxs0tu serves https://translate.hetz.autismstaking.xyz.

## Plan of Work

First add library.ts with record types, validation, history retention, favorite toggling, and serialized storage. Then add a React hook to load before changing saved data and report failures. Add a library modal with History/Favorites tabs, empty/loading states, dated request/result previews, star toggles, and reopening. Capture request settings before awaiting translation and restore them with the saved result. Add tests for persistence, corruption, independent favorites, request snapshots, failures, and reopening without network calls.

## Concrete Steps

Work in /Users/j/translate-app on codex/device-history-favorites. Commit the plan, storage milestone, and UI/tests milestones separately. Run pnpm lint, pnpm typecheck, pnpm test:unit, and pnpm build. Do not run a local UI server or the existing web E2E command because it starts one. Run scripts/classify-deployment-change.sh main HEAD. Switch Coolify git_branch through MCP, push the branch and inspect deployments before requesting a deployment to avoid duplicates. Use only MCP for Coolify state. Use agent-browser --session translate-history-qa for the public application.

## Validation and Acceptance

Translate a phrase, observe history, star it, reload, and open it from favorites. The original request, result, and pronunciation must return without a new API call. Unstar from either location and ensure history remains. Check a second isolated browser has empty collections. Verify mobile and desktop layouts. Tests must cover delayed storage hydration and storage write failure. Lint, types, unit tests and production build must pass.

## Idempotence and Recovery

The key thai-translate-library-v1 is additive and does not touch preferences. Invalid entries are ignored; read errors prevent mutations until a reload can read safely. Failed writes leave in-memory data usable and show a warning; a later change retries the full state. To roll back code, use a follow-up commit and deploy through MCP; never delete device data as part of rollback.

## Artifacts and Notes

Evidence and deployment commit IDs will be recorded here after verification.

## Interfaces and Dependencies

Use existing AsyncStorage, React, React Native, Ionicons, and contract validators. TranslationEntry contains id, createdAt, request: TranslationRequest, result: TranslationResult. TranslationLibrary contains history and favorites arrays. library.ts exports loadLibrary, saveLibrary, addToHistory, toggleFavorite; use-translation-library.ts exposes loaded library, readiness, storage error, record, and toggle actions. No new dependencies.

Revision 2026-09-17: Initial executable plan after repository inspection.
