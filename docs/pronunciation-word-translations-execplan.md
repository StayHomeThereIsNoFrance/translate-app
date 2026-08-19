# Add word-by-word pronunciation translations and a visibility setting

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

After this change, each token in both pronunciation cards has a small contextual translation directly underneath it. The Latin pronunciation card uses English glosses and the Cyrillic pronunciation card uses Russian glosses. A settings button in the page header opens a dialog where the user can hide or show those glosses; the choice persists between app launches. The feature is visible after translating any phrase, and can be verified by toggling the setting while the result remains on screen.

## Progress

- [x] (2026-08-19 13:23Z) Inspected the client, API, shared contracts, prompts, preferences, and current automated tests; created branch `codex/pronunciation-word-translations`.
- [x] (2026-08-19 13:27Z) Extended provider and public contracts with aligned pronunciation tokens and bilingual contextual glosses; updated fixtures and contract/API tests.
- [x] (2026-08-19 13:33Z) Added the persisted visibility preference, settings dialog, wrapping token layout, and client tests.
- [ ] Run repository validation and repair any failures.
- [ ] Commit and push the branch, deploy it through Coolify, and verify the real web UI without starting it locally.

## Surprises & Discoveries

- Observation: The current model response contains only two complete pronunciation strings, so the client cannot reliably infer which translation belongs under each displayed token.
  Evidence: `packages/contracts/src/index.ts` defines only `pronunciationLatin` and `pronunciationRussian` in `ModelTranslationSchema`.

- Observation: Existing preferences are already stored in AsyncStorage under `thai-translate-preferences-v1`; extending that object can preserve existing installations without a storage migration.
  Evidence: `apps/client/src/features/translator/preferences.ts` parses one JSON object and falls back to defaults when storage is absent.

- Observation: The machine's default Homebrew Node 25 binary is unusable because it links to a removed `simdjson.29` library, while the repository requires Node 24.
  Evidence: The first `pnpm` attempt stopped in `dyld` before running tests. Prepending `/opt/homebrew/opt/node@24/bin` produced Node `v24.18.0`, after which contract and API tests ran normally.

- Observation: React Native Web puts the `testID` of a `Switch` on a wrapper while the actual checkbox is a nested input with the accessible `switch` role.
  Evidence: The first Playwright assertion reported that `word-translations-switch` was not a checkbox. Selecting `getByRole('switch', { name: 'Показывать перевод под словами' })` allowed checked-state and click assertions to pass on desktop and mobile projects.

## Decision Log

- Decision: Ask the translation provider for one aligned array whose entries contain Latin pronunciation, Cyrillic pronunciation, an English gloss, and a Russian gloss.
  Rationale: One shared array gives the UI a stable one-to-one alignment across both cards and avoids fragile client-side splitting or guessing. The API will continue exposing the existing complete `latin` and `russian` strings, derived from the same entries, so the current public fields remain available.
  Date/Author: 2026-08-19 / Codex

- Decision: Treat a displayed pronunciation token as the unit that receives a gloss, even when it is a syllabic decomposition of a Thai lexical word.
  Rationale: The request is specifically about text under every displayed word in the pronunciation rows. This makes examples such as `khop khun khrap` fully annotated and keeps both scripts aligned.
  Date/Author: 2026-08-19 / Codex

- Decision: Default the visibility setting to enabled and store it alongside the existing translator preferences.
  Rationale: The requested feature should be visible immediately, while users who prefer the compact layout can disable it and retain that choice.
  Date/Author: 2026-08-19 / Codex

## Outcomes & Retrospective

The provider/API and client milestones are complete. Contract tests pass (5 tests), API tests pass (22 tests), client tests pass (17 tests), and web E2E passes in desktop and mobile Chromium (6 tests). Full repository validation and Coolify QA remain.

## Context and Orientation

This repository is a pnpm workspace. `packages/contracts/src/index.ts` contains the Zod schemas shared by the API and Expo client. `apps/api/src/translator.ts` calls an OpenAI-compatible Responses API with a strict JSON schema. The two prompt templates in `config/prompts/` tell the model how to translate and pronounce Thai. `apps/api/src/app.ts` maps the model result into the public HTTP response. `apps/client/src/features/translator/api.ts` validates that response, and `apps/client/src/features/translator/translator-screen.tsx` renders it. `apps/client/src/features/translator/preferences.ts` persists translator choices using AsyncStorage.

In this plan, a “gloss” means a short contextual meaning displayed under one pronunciation token. It is not intended to replace the full sentence translation. An “aligned token” means one array entry that contains the same spoken Thai segment in Latin and Cyrillic writing plus its English and Russian glosses.

The repository instructions require feature work on a separate branch and require UI validation through Coolify rather than by starting the web app locally. The current default branch is named `main`, despite the older `master` wording in `AGENTS.md`; no merge is part of this implementation turn because user approval must come first.

## Plan of Work

First, change `packages/contracts/src/index.ts` so a model result contains a non-empty `pronunciationWords` array. Each entry will require `latin`, `russian`, `englishTranslation`, and `russianTranslation` strings. The public `TranslationResultSchema` will retain `pronunciation.latin` and `pronunciation.russian` and add the same array as `pronunciation.words`. Update `apps/api/src/translator.ts` to request that exact strict shape, update both prompt files to require concise contextual glosses and aligned punctuation, and update `apps/api/src/app.ts` to derive the complete pronunciation strings from the entries. Adjust unit fixtures and the deterministic E2E server so all layers use representative aligned data.

Second, extend `TranslatorPreferences` with `showWordTranslations: boolean`, defaulting to `true`. The loader must interpret a missing property from older stored JSON as `true`. In `translator-screen.tsx`, add a settings icon to the header and a modal dialog with an accessible switch. Render each pronunciation array entry as a small vertical stack: pronunciation above, muted gloss below. Preserve wrapping on narrow screens. When the setting is off, keep the pronunciation tokens visible but omit the gloss text. Save the setting through the existing preferences effect.

Third, add unit coverage for schema validation, public response mapping, preference compatibility, default gloss rendering, toggling, and persistence. Update Playwright coverage to assert the token glosses, open settings, disable them, and confirm they disappear while pronunciation stays visible.

Finally, run formatting-independent linting, type checking, unit tests, web E2E, and the production build. Do not start the UI locally. Commit and push the working branch, configure the existing Coolify application to build that branch, wait for a healthy deployment, and use the deployed page to verify both desktop/narrow wrapping and the visibility toggle. Capture the result in this plan before handing it to the user for approval.

## Concrete Steps

Run all repository commands from `/Users/j/translate-app`.

Create and remain on the feature branch:

    git switch -c codex/pronunciation-word-translations

After each milestone, inspect and commit only intended changes:

    git status --short
    git diff --check
    git add <milestone files>
    git commit -m "<milestone description>"

Validate non-UI behavior without running a local web server:

    pnpm lint
    pnpm typecheck
    pnpm test:unit
    pnpm test:e2e:web
    pnpm build

The expected result is zero command failures. `test:e2e:web` may build static web assets and start its test fixture through Playwright configuration; this is automated test execution, not manual local UI validation. Manual UI verification must use the Coolify deployment.

Push the branch only after tests pass:

    git push -u origin codex/pronunciation-word-translations

Then switch the existing Coolify application source branch to `codex/pronunciation-word-translations`, trigger or await the deployment, and open the deployed application. Translate `Как тебя зовут?` or another short phrase. Confirm every Latin token has an English gloss and every Cyrillic token has a Russian gloss. Open the gear button, disable `Перевод под словами`, and confirm the glosses disappear without removing the pronunciations. Refresh the page and confirm the switch remains disabled. Re-enable it before completing QA unless there is a reason to preserve the disabled browser preference.

## Validation and Acceptance

The shared contract accepts a fully populated aligned-token array and rejects missing gloss fields. The provider unit test proves the strict schema is requested and parsed. The API unit test proves the public response retains the two complete pronunciation strings and includes aligned word data.

The preference unit test proves new installs default to visible glosses, older valid JSON without the new field also defaults it to visible, and saving writes the boolean. The screen test proves glosses appear by default and disappear after operating the settings switch while the pronunciation tokens remain. The end-to-end browser test proves the same behavior in the exported web app.

Human acceptance in Coolify requires all of the following: word stacks wrap rather than overflow; English glosses appear only under Latin pronunciation tokens; Russian glosses appear only under Cyrillic pronunciation tokens; the settings dialog is reachable by an accessible gear button; disabling the setting hides only the glosses; refreshing preserves the choice.

## Idempotence and Recovery

The code and test commands are safe to repeat. AsyncStorage needs no destructive migration because a missing new field is interpreted as the enabled default. If the provider rejects the new strict schema, inspect the captured API test shape before changing the contract; do not weaken required gloss validation silently. If a Coolify deployment fails, leave the current healthy production deployment in place, inspect build logs, fix and push a new feature-branch commit, and redeploy the same branch. Do not switch or merge the default branch before user approval.

## Artifacts and Notes

The intended model token shape is:

    {
      "latin": "khrap?",
      "russian": "крап?",
      "englishTranslation": "polite particle",
      "russianTranslation": "вежливая частица"
    }

The complete public pronunciation strings are computed by joining the `latin` values and the `russian` values with one space. This guarantees that the visible word stacks and compatibility strings originate from identical data.

## Interfaces and Dependencies

`packages/contracts/src/index.ts` must export the inferred pronunciation word type through the schemas. `ModelTranslation` must contain `translation`, `thaiText`, and `pronunciationWords`. `TranslationResult` must contain `translation`, `thaiText`, `requestId`, and `pronunciation` with `latin`, `russian`, and `words`.

`TranslatorPreferences` in `apps/client/src/features/translator/preferences.ts` must contain `mode`, `speakerGender`, `sourceLanguage`, and `showWordTranslations`. No new dependency is needed: the client already depends on React Native, Ionicons, and AsyncStorage, which provide the modal, switch, gear icon, and persistence mechanisms.

Revision note (2026-08-19 13:23Z): Created the initial self-contained plan after repository and contract inspection. It records the aligned-array design because the existing flat strings cannot support reliable per-token translations.

Revision note (2026-08-19 13:27Z): Marked the contract/API milestone complete, recorded its passing tests, and documented the required Node 24 runtime after the broken default Node binary was discovered.

Revision note (2026-08-19 13:33Z): Marked the client milestone complete, recorded passing unit/E2E evidence, and documented the React Native Web switch selector needed for reliable browser tests.
