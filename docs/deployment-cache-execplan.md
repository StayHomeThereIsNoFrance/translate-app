# Avoid duplicate deployments and unrelated APK rebuilds

This ExecPlan is a living document and must be maintained in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

After this change, documentation, plans, tests, and repository-only maintenance do not start a Coolify deployment. Server-only changes still deploy the server but reuse the existing Android image layers, so Gradle does not run. Client, shared-contract, Android build-script, dependency-lock, or Docker build changes still rebuild the APK. When an already verified feature branch is merged to `main` without changing its tree, Coolify is switched back to `main` without another deployment.

The observable result is that the public web/API and `https://translate.hetz.autismstaking.xyz/apk` keep working while routine merges and unrelated edits stop paying the multi-minute Android build cost.

## Progress

- [x] (2026-09-16 20:23+07:00) Inspected the production Docker graph, repository build commands, current Coolify application, and the dirty worktree belonging to another task.
- [x] (2026-09-16 20:23+07:00) Created isolated branch `codex/deployment-path-caching` in a separate worktree based on clean `main`.
- [x] (2026-09-16 20:30+07:00) Separated the Android toolchain and APK inputs from API-only and repository-only files.
- [x] (2026-09-16 20:30+07:00) Added a deterministic deployment-impact classifier and regression checks for no-op, server-only, APK-affecting, and identical-tree merge changes.
- [x] (2026-09-16 20:31+07:00) Recorded the no-redeploy identical-tree merge procedure, deployment classification, and Coolify watch-path source of truth.
- [x] (2026-09-16 20:32+07:00) Passed lint, type checking, 37 unit tests, deployment-policy regression tests, production web/API builds, shell syntax, and Docker stage-boundary assertions.
- [x] (2026-09-16 20:50+07:00) Pushed the branch, saved ordered Coolify watch paths through MCP, deployed commit `77eff665`, and verified the public web page, `/healthz`, and a ranged `/apk` response in an isolated agent-browser session.

## Surprises & Discoveries

- Observation: `apk-builder` inherits the shared dependency stage and then executes `COPY . .`, so an API source edit invalidates the APK build even though Android sources did not change.
  Evidence: the root `Dockerfile` has one `dependencies` stage containing API, client, and contract manifests, followed by an Android stage with a repository-wide copy.

- Observation: the active workspace is on `codex/server-translation-cache` with tracked and untracked API test changes.
  Evidence: `git status --short --branch` reports three unrelated files, so this work is isolated in a separate Git worktree rather than switching the shared checkout.

- Observation: production already has Docker build caching enabled and automatic Git deployment enabled, but no watch paths.
  Evidence: Coolify application `ek2k3scxtyw65x3a6csxs0tu` reports `disable_build_cache: false`, `is_auto_deploy_enabled: true`, and `watch_paths: null`.

- Observation: the host Docker daemon is not running, so local Dockerfile validation cannot execute a native image build.
  Evidence: `docker build --check .` returns `Cannot connect to the Docker daemon`; structural cache-boundary tests pass, and the required native acceptance build will run on Coolify.

- Observation: a global `**/*.md` Docker ignore rule also removed production prompts, whose source format is Markdown.
  Evidence: the first native image built successfully, but deployment `dt51jtiqlzbsnlcodnbd3iov` failed healthcheck with `ENOENT /app/config/prompts/farang-ploy.md` and rolled back to the healthy previous container. The ignore rule was narrowed to `AGENTS.md` and `CLAUDE.md`, while the existing root `README.md` and `docs` exclusions remain.

- Observation: the saved Coolify watch paths suppress a real documentation-only push.
  Evidence: commit `c7af7ba` changed only `AGENTS.md` and this ExecPlan; the classifier returned `deployment=none apk=none`. After the push, the application still had 14 deployment records and the newest remained finished deployment `rsqilb2djstzoyp5yls8k8a3` for the earlier production commit `77eff665`; no webhook deployment was created.

## Decision Log

- Decision: Keep one runtime container and one stable `/apk` route, but split Docker stages by their actual inputs.
  Rationale: this preserves the working deployment architecture and direct URL while allowing BuildKit to reuse the Android result for server-only changes.
  Date/Author: 2026-09-16 / Codex

- Decision: Treat root dependency manifests and the lockfile as APK-affecting even if a particular edit may only concern the API.
  Rationale: the shared pnpm lockfile is the reproducibility boundary for client dependencies. Conservatively rebuilding after lockfile changes is safer than publishing an APK from dependencies that are not represented by the deployed revision.
  Date/Author: 2026-09-16 / Codex

- Decision: Use ordered positive and negative Coolify watch patterns.
  Rationale: source, assets, production configuration, Docker inputs, and the APK script must deploy; Markdown, tests, coverage, and local tooling must not. Coolify evaluates watch patterns in order with the last match winning.
  Date/Author: 2026-09-16 / Codex

- Decision: A merge to `main` is a metadata-only handoff only when the deployed feature revision and `main` have identical trees.
  Rationale: switching the configured branch without redeployment is safe only when it selects exactly the bytes already running. Any tree difference must be classified normally.
  Date/Author: 2026-09-16 / Codex

## Outcomes & Retrospective

The selective deployment policy is implemented and the feature branch is live in Coolify pending user approval. Lint, type checking, 37 unit tests, policy regression tests, and production web/API builds pass. Coolify saved the exact ordered watch-path value from `config/deployment/coolify-watch-paths.txt`, with automatic deployment and Docker caching enabled.

The first native image build completed but its container failed healthcheck because the initial global Markdown ignore also excluded production prompts. Coolify kept the previous healthy container. After narrowing the rule and adding a regression assertion, deployment `rsqilb2djstzoyp5yls8k8a3` built commit `77eff6654e2fbe0ab61a6e5625411e5521d14311`, produced the APK with SHA-256 `a3af1c8266871e9a32206162169a25b8a719da58e26de4176b0a149b5251ef6d`, passed healthcheck on its first attempt, and finished its rolling update.

Public verification used an isolated `agent-browser` session. The production page rendered its translator controls. `/healthz` returned `200` with status `ok`. A same-origin ranged request to `/apk` returned `206`, Android package media type, attachment filename `thai-ai-translate.apk`, `no-store`, exactly 1024 requested bytes, and total artifact size 42,583,825 bytes.

The repository now expresses three outcomes: irrelevant changes do not deploy, server/prompt changes deploy while the APK stage remains independent, and client/shared/dependency/Docker changes rebuild the APK. The exact no-redeploy merge workflow is recorded in `AGENTS.md`. The remaining lifecycle step is user approval followed by merge to `main`; if the classifier reports no production difference from the already deployed revision, that handoff changes only Coolify's branch setting and performs no deploy or restart.

## Context and Orientation

The root `Dockerfile` creates the web/API bundle in `app-builder`, installs the Android SDK in `android-toolchain`, builds the APK in `apk-builder`, and copies the APK into the final Node runtime. `scripts/build-apk.sh` invokes the client package's Expo Prebuild and Gradle release command. The API serves the resulting file at `/apk`.

Coolify application `ek2k3scxtyw65x3a6csxs0tu` deploys the repository root with `/Dockerfile`, currently from branch `main`. Coolify watch paths affect only automatic Git-provider webhook deployments; manual deployments remain possible.

`scripts/classify-deployment-change.sh` will be the local, reviewable expression of the same policy. It compares two Git revisions or a revision and the working tree, lists changed paths, and prints one of three outcomes: no deployment, server deployment with cached APK, or deployment with APK rebuild. The script does not mutate Git or Coolify.

## Plan of Work

First split the Docker base so the Android SDK layer does not inherit API dependencies. Copy only the root package metadata, client runtime inputs, shared contract runtime inputs, and `scripts/build-apk.sh` into `apk-builder`. Keep server and web inputs in their own builder. This makes the cache key correspond to actual consumers.

Next add the deployment-impact classifier and shell-level regression coverage. The tests create temporary commits containing representative documentation, API source, client source, and equal-tree merge changes, then assert the expected outcome. The classifier and Coolify watch configuration will share the same documented path categories.

Then update `AGENTS.md`, `README.md`, and architecture documentation. The merge rule will name the actual default branch `main`, require an identical-tree check, and prohibit redeploy/restart when only the configured branch is being moved from an already deployed feature revision to identical `main`.

Finally run syntax, unit, type, and production build checks that do not open a local UI. Push the feature branch. Through Coolify MCP, set ordered watch paths, switch the application to the feature branch, deploy it, and inspect deployment logs to confirm the APK stage succeeds. Verify `/healthz` and `/apk` after the healthy rollout. Leave the feature branch deployed for user approval; do not merge in this implementation turn.

## Concrete Steps

All repository commands run from the isolated worktree on `codex/deployment-path-caching`.

    bash -n scripts/build-apk.sh scripts/classify-deployment-change.sh
    scripts/tests/classify-deployment-change.test.sh
    pnpm typecheck
    pnpm test:unit
    pnpm build

Docker validation should show that `apk-builder` has no `COPY . .`, no API package or source input, and no dependency on the server dependency stage. If a native local Docker build is impractical, the native Coolify build is the acceptance build and its logs are the evidence.

The Coolify `watch_paths` value is newline-separated, evaluated in order, and includes production paths followed by negations for Markdown and tests. After updating it through MCP, read the application back and verify the exact saved value before deployment.

## Validation and Acceptance

Repository acceptance requires the classifier tests, TypeScript checks, unit tests, and production web/API build to pass. Static Docker assertions must prove the Android stage excludes `apps/api` and repository-wide copies.

Production acceptance requires one finished Coolify feature-branch deployment, healthy application status, `GET /healthz` returning success, and `GET /apk` returning a non-empty Android package response. Deployment logs must show the refactored Android stage building successfully. A subsequent server-only revision must report the APK build step as cached if a safe server-only commit exists in this branch; otherwise the structural Docker regression test is the required evidence and the next real server-only deployment provides runtime confirmation.

The merge procedure is accepted when repository instructions say to compare the deployed feature tree to `main`, merge, push, update only `git_branch` to `main` through Coolify MCP, and skip deploy/redeploy/restart when the trees match.

## Idempotence and Recovery

The classifier is read-only and repeatable. Docker and project checks are repeatable. Coolify watch-path and branch updates are idempotent when the same values are sent again. If the feature deployment fails, keep the last healthy container, inspect deployment logs through MCP, fix and push another commit on the same feature branch, and retry. Do not merge to `main` before user approval.

If watch paths are saved incorrectly, restore the previous value `null` through Coolify MCP and confirm it by reading the application. If branch switching would select a different tree than the currently deployed feature revision, do not use the metadata-only merge procedure; deploy the differing `main` tree normally.

## Interfaces and Dependencies

`scripts/classify-deployment-change.sh [BASE [HEAD]]` accepts Git revision names. With no arguments it compares `HEAD` to the working tree; with one it compares that revision to the working tree; with two it compares the revisions. It prints changed files and exactly one final machine-readable line:

    deployment=none apk=none
    deployment=required apk=cached
    deployment=required apk=rebuild

It exits zero for a successful classification and nonzero only for invalid arguments or Git errors.

Revision note (2026-09-16): Created the plan after repository and production inspection, including isolation from another task's dirty worktree.

Revision note (2026-09-16): Recorded and fixed the first native rollout's missing-prompt failure; added a regression assertion that production prompts cannot be excluded from the Docker context.

Revision note (2026-09-16): Recorded the successful production rollout, public endpoint checks, and real documentation-only watch-path suppression.
