# Device-local translation history and favorites

This living plan follows docs/PLANS.md.

## Purpose / Big Picture

Successful translations should remain available after reopening the app. Users can star a translation, browse history and favorites separately, and reopen a saved result including pronunciation without another API request. Data belongs to this app installation or browser origin on the current device.

## Progress

- [x] (2026-09-17) Inspected client, contracts, storage, tests, and Expo 57 documentation; created codex/device-history-favorites.
- [x] (2026-09-17) Implemented validated local storage, independent favorites, retention and serialized writes; five storage tests pass.
- [x] (2026-09-17) Integrated library modal, navigation and star actions; all 22 client tests pass, including reloading, write/read failure and delayed hydration.
- [x] (2026-09-17) Workspace lint, types, all 64 unit tests and production web/API build passed.
- [x] (2026-09-17) Switched Coolify to the feature branch and started deployment iyukh5elxfv3hfsiqz9u4lla of a9a5dca4282b89893451bb1888f8166f9e73a2ec.
- [x] (2026-09-17 14:15Z) Deployment finished; Coolify reports running:healthy. Verified desktop/mobile UI, reload persistence, opening with translation API blocked, star removal without history loss, and empty collections in a separate browser session.

## Surprises & Discoveries

AsyncStorage is already installed for preferences, so no dependency or backend change is required. The result includes pronunciation and a request ID; request settings must be saved alongside it, since screen controls can change while a request is pending.

## Decision Log

2026-09-17: Save successful requests, not failed attempts, with full request/result snapshots and timestamps. Retain the most recent 200 history entries and keep favorites independently so history eviction cannot delete them. Use existing AsyncStorage with a versioned key, validate saved records using contract schemas, serialize writes, and surface storage failures without hiding a successful translation. Display separate library tabs in a modal to keep the translator uncluttered. No account or server synchronization is added.

## Outcomes & Retrospective

Implementation is complete. All 64 workspace unit tests, lint, type checks and the web/API production build pass. Deployment and browser verification are complete. The deployed image also builds the Android APK; native installation was not exercised. Main remains unchanged pending user approval. Main stays unchanged until user approval under AGENTS.md.

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

Storage tests cover malformed data, independent favorites after history eviction, full snapshot roundtrips and ordered writes after failures. Screen tests cover persistence across remount, restoring without another request, changing settings during an in-flight request, failed reads/writes, and adding a result while existing history and favorites are still hydrating.

    pnpm test:unit: contracts 5 passed, API 37 passed, client 22 passed
    pnpm lint: passed
    pnpm typecheck: passed
    pnpm build: passed
    scripts/classify-deployment-change.sh main a9a5dca: deployment=required apk=rebuild
    scripts/classify-deployment-change.sh a9a5dca f4430eb: deployment=none apk=none

Coolify deployment iyukh5elxfv3hfsiqz9u4lla builds a9a5dca4282b89893451bb1888f8166f9e73a2ec. The subsequent f4430eb commit changes only tests and README and does not require another build.

## Interfaces and Dependencies

Use existing AsyncStorage, React, React Native, Ionicons, and contract validators. TranslationEntry contains id, createdAt, request: TranslationRequest, result: TranslationResult. TranslationLibrary contains history and favorites arrays. library.ts exports loadLibrary, saveLibrary, addToHistory, toggleFavorite; use-translation-library.ts exposes loaded library, readiness, storage error, record, and toggle actions. No new dependencies.

Revision 2026-09-17: Initial executable plan after repository inspection.

Revision 2026-09-17: Recorded implementation and initial test results. The shell defaults to Node 26; validation uses PATH=/opt/homebrew/opt/node@24/bin:$PATH to match the project Node 24 requirement.

Revision 2026-09-17: Recorded successful full validation and deployment identifiers while waiting for the Android-containing image build.

## Browser verification evidence

The isolated translate-history-qa browser translated «Спасибо за помощь» through the real deployed API, added it to favorites, reloaded, and reopened it. With **/api/v1/translate blocked through agent-browser, the saved result and pronunciation still opened. Removing its star emptied favorites while history retained the entry; starring from history added it back. A second isolated session, translate-history-isolation, showed empty history and favorites. Visual screenshots at 390×844 and 1280×900 showed the modal and star controls fitting correctly.

Local evidence screenshots: /tmp/translate-history-mobile-stable.png and /tmp/translate-favorites-desktop-final.png. Coolify deployment iyukh5elxfv3hfsiqz9u4lla finished at 2026-09-17T14:12:29Z; application status is running:healthy on codex/device-history-favorites. Production commit is a9a5dca4282b89893451bb1888f8166f9e73a2ec. Later commits only change tests and documentation, so do not redeploy them. On approval, follow AGENTS.md and compare this deployed SHA against the merged main before any deployment decision.

Revision 2026-09-17: Marked the work complete after deployed browser QA. Native device testing was outside this verification run; both platforms share the implemented components and AsyncStorage adapter.
