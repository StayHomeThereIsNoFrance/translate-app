# Publish the Android APK from Coolify at a stable direct URL

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

After this change, an Android user can open `https://translate.hetz.autismstaking.xyz/apk` and download the current installable Thai AI Translate preview APK directly. The APK is built from the same Git revision as the web/API container during the Coolify Docker deployment, so publishing a new application revision also refreshes the download without checking a binary into Git or transferring it through SSH. A repository script provides the one reproducible APK build entry point used both by developers and by the Docker build.

## Progress

- [x] (2026-08-28 23:56Z) Created `codex/apk-coolify-download` from the clean `main` branch and inspected repository, Android, Docker, API static-file, and current Coolify application configuration.
- [x] (2026-08-28 23:56Z) Read the Expo SDK 57 reference and current official Expo Android APK/local-production guidance before designing the implementation.
- [x] (2026-08-28 23:59Z) Added and tested the direct APK HTTP route; all 20 API tests and API type checking pass under Node 24.
- [ ] Add the reusable APK build script and wire the Android toolchain and artifact into the production Docker image.
- [ ] Document the operator and user workflow, then run repository and container verification.
- [ ] Push the feature branch, switch the Coolify application to it, deploy through Coolify MCP, and verify the live APK response and artifact integrity.

## Surprises & Discoveries

- Observation: The production Coolify resource uses the root `Dockerfile` directly, not `docker-compose.coolify.yml`.
  Evidence: Coolify application `ek2k3scxtyw65x3a6csxs0tu` reports build pack `dockerfile`, Dockerfile location `/Dockerfile`, exposed port `3000`, branch `main`, and healthy status.

- Observation: Expo Prebuild currently generates a release build signed by the generated debug keystore, which is appropriate for the repository's existing sideloaded preview APK but not for Google Play distribution.
  Evidence: `apps/client/android/app/build.gradle` assigns `signingConfigs.debug` to the `release` build type, and the existing physical-device workflow describes the output as a preview APK.

- Observation: Expo SDK 57 uses Android compile and target SDK 36, while the generated React Native build also needs NDK `27.1.12297006` and local builds use CMake `3.22.1`.
  Evidence: the versioned Expo SDK reference lists compile/target 36; generated Gradle properties report build tools `36.0.0`, compile SDK 36, target SDK 36, and NDK `27.1.12297006`; the validated local SDK contains CMake `3.22.1`.

- Observation: The interactive shell defaults to Node 26 even though this workspace requires Node 24, and `@fastify/static` replaces a custom cache header unless cache-control generation is disabled for that `sendFile` call.
  Evidence: the first pnpm attempt stopped with `Expected version: >=24 <25, Got: v26.7.0`; the first route test received `public, max-age=0` until `sendFile` was passed `{ cacheControl: false }`. Node 24.18.0 is available at `/opt/homebrew/opt/node@24/bin`.

## Decision Log

- Decision: Build the APK inside a dedicated Docker build stage and copy only the final APK into the small Node runtime image.
  Rationale: Coolify deploys from Git, so a local-only APK does not exist in the remote build context. Building in the Docker stage makes the artifact correspond to the deployed revision, avoids committing a roughly 41 MB binary, and keeps Java and Android SDK tooling out of the runtime image.
  Date/Author: 2026-08-28 / Codex

- Decision: Keep the published APK arm64-only and signed as the existing preview build is signed.
  Rationale: The repository already validates the arm64 artifact on the target Galaxy S22+ and explicitly treats it as sideloaded preview distribution. Changing ABI scope or release credentials would expand the request and introduce signing-secret management.
  Date/Author: 2026-08-28 / Codex

- Decision: Serve the APK through Fastify from the existing static directory at exact route `/apk`, with attachment filename `thai-ai-translate.apk`, Android APK media type, and revalidation caching.
  Rationale: This preserves the requested short stable URL, uses the existing one-container/same-origin architecture, and prevents the SPA fallback from returning HTML when the user expects a binary.
  Date/Author: 2026-08-28 / Codex

- Decision: Pin Android command-line tools, SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, and CMake 3.22.1 in the Dockerfile.
  Rationale: A deployment build must be reproducible and must match the toolchain required by Expo SDK 57 and the generated Gradle project. The command-line-tools archive will be verified by its published SHA-256 checksum before extraction.
  Date/Author: 2026-08-28 / Codex

## Outcomes & Retrospective

Implementation is in progress. The outcome will be complete only after the feature branch has built successfully in Coolify and the public `/apk` response has been verified as the APK produced by that deployment.

## Context and Orientation

The repository is a pnpm workspace rooted at `/Users/j/translate-app`. `apps/client` is an Expo SDK 57 React Native application. Its native `apps/client/android` directory is generated by Expo Prebuild and ignored by Git. The current `build:android` package command runs Prebuild, invokes Gradle `assembleRelease`, and produces `apps/client/android/app/build/outputs/apk/release/app-release.apk` for the `arm64-v8a` CPU architecture.

`apps/api/src/app.ts` creates the Fastify HTTP server. In production it registers `@fastify/static` with the directory configured by `STATIC_DIR`, serves the exported web application from that directory, and falls back to `index.html` for non-API browser routes. The Docker runtime sets `STATIC_DIR=/app/web`. The new APK will also live in `/app/web`, but `/apk` needs an explicit route so the fallback can never substitute the web application.

The root `Dockerfile` currently has one Node 24 Alpine builder that installs pnpm dependencies, builds web/API output, and deploys production API dependencies, followed by a small Node 24 Alpine runtime. Coolify application `ek2k3scxtyw65x3a6csxs0tu` builds this file from the Git branch recorded in the application configuration and exposes the container on `https://translate.hetz.autismstaking.xyz`.

An APK, or Android Package, is an installable Android application archive. An Android NDK is the native development kit used to compile the C++ portion of React Native. CMake is the native build generator used by that NDK build. These large build-only tools must not be copied into the production runtime layer.

## Plan of Work

First, add an HTTP-level regression test to `apps/api/tests/app.test.ts`. It will create a temporary static directory containing an `index.html` fixture and small fake `thai-ai-translate.apk`, start `buildApp` with that directory, request `/apk`, and prove that the response is the fixture bytes with status 200, `application/vnd.android.package-archive`, attachment filename, and a cache policy that revalidates the stable URL. Then modify `apps/api/src/app.ts` after registering `@fastify/static` to register the exact route and send that filename. The existing SPA fallback remains unchanged for other non-API GET routes.

Second, add `scripts/build-apk.sh`. The script will fail early unless Node major version 24, Java 17, and a usable Android SDK directory are present. It will default `EXPO_PUBLIC_API_BASE_URL` to the production HTTPS origin, run the existing client arm64 release build, copy the Gradle output to `dist/apk/thai-ai-translate.apk` or an explicit `APK_OUTPUT_PATH`, and print its byte count and SHA-256. Directory creation and copying will use commands available on both macOS and Debian Linux. Root `package.json` will expose the script as `pnpm build:apk` while preserving the lower-level client command and the S22+ install workflow.

Third, restructure the root `Dockerfile` around shared Node dependencies. A Debian-based Android builder will install OpenJDK 17 and the checksum-pinned official Android command-line tools, accept licenses non-interactively, and install only the SDK/NDK/CMake packages required by the generated project. It will call the repository APK script with `/tmp/thai-ai-translate.apk` as output. The ordinary web/API builder remains separate so its outputs and API production dependency deployment are clear. The final Alpine runtime receives only the API, web export, prompts, and APK; a build-time file check makes a missing or empty APK fail the deployment rather than serving a false success.

Fourth, update `README.md`, `docs/Architecture.md`, and this plan to explain the public URL, build command, architecture, preview-signing limitation, and deployment behavior. Run shell syntax validation, API tests, lint, type checking, unit tests, web/API builds, the local APK script, and a full local Docker build. Exercise the built container without starting the web UI as an application-development shortcut; a bounded container smoke test may request health and `/apk` only.

Finally, commit and push each completed milestone. Through Coolify MCP, update only the target application's Git branch to `codex/apk-coolify-download`, trigger and wait for a deployment, inspect the deployment and health state, and verify the public response. The live acceptance check downloads the artifact, confirms an HTTP 200 response, content type and disposition, validates it as a ZIP/APK, and records size and SHA-256. The application remains on the feature branch until the user approves merging; after approval, use the repository's actual default branch `main` unless the user directs creation of a separate `master` branch.

## Concrete Steps

Run all repository commands from `/Users/j/translate-app`.

The working branch already exists:

    git switch codex/apk-coolify-download

After implementing the API route, run:

    pnpm --filter @thai-translate/api test
    pnpm --filter @thai-translate/api typecheck

The new route test must pass and prove that `/apk` returns fixture bytes instead of `index.html`.

After implementing the build script, run:

    bash -n scripts/build-apk.sh
    pnpm build:apk

The command must end by identifying `dist/apk/thai-ai-translate.apk`, a nonzero byte size, and a SHA-256 digest. The current expected order of magnitude is 41 MB; exact bytes and digest can change with source revisions and build tooling.

Build the complete deployment image from the repository root:

    docker build -t thai-ai-translate:apk-test .

Inspect the image rather than trusting a successful layer alone:

    docker run --rm --entrypoint sh thai-ai-translate:apk-test -c 'test -s /app/web/thai-ai-translate.apk'

Run standard repository verification in proportion to the change:

    pnpm lint
    pnpm typecheck
    pnpm test:unit
    pnpm build
    git diff --check

Before Coolify deployment, push the branch:

    git push -u origin codex/apk-coolify-download

Use Coolify MCP to update application `ek2k3scxtyw65x3a6csxs0tu` to the feature branch and deploy it. Do not use a browser, direct Coolify API, CLI, SSH, or the Coolify web interface.

After MCP reports a healthy completed deployment, download the public artifact to a temporary path and inspect headers and bytes:

    curl --fail --location --dump-header /tmp/thai-ai-translate.headers --output /tmp/thai-ai-translate.apk https://translate.hetz.autismstaking.xyz/apk
    file /tmp/thai-ai-translate.apk
    shasum -a 256 /tmp/thai-ai-translate.apk

The response must be HTTP 200, use `application/vnd.android.package-archive`, offer `thai-ai-translate.apk` as an attachment, and contain a valid Android APK rather than HTML.

## Validation and Acceptance

`pnpm build:apk` is accepted when it runs the existing Expo Prebuild plus Gradle release build, targets the production HTTPS API by default, emits the normalized artifact path, and fails if the expected Gradle output is absent or empty. It must be possible to override only the non-secret API origin and output path through `EXPO_PUBLIC_API_BASE_URL` and `APK_OUTPUT_PATH`.

The API is accepted when a test request to `/apk` returns the exact fixture bytes with status 200 and download headers, while existing health and translation tests continue to pass. The Docker image is accepted when `/app/web/thai-ai-translate.apk` exists and the final image contains no Java compiler or Android SDK directory.

The deployed feature is accepted only when Coolify MCP reports application `ek2k3scxtyw65x3a6csxs0tu` running healthy from `codex/apk-coolify-download`, its deployment ends with `finished`, and `https://translate.hetz.autismstaking.xyz/apk` returns an actual nonempty APK with the expected media type and attachment name. The main site health check must remain HTTP 200 after adding the much longer Android build stage.

## Idempotence and Recovery

The APK script is safe to rerun: Expo regenerates the ignored Android project and the final copy replaces only the requested artifact path. Docker builds are layered and safe to retry after network or Gradle dependency failures. No binary, signing password, SDK license data, or generated native directory is committed.

If the Android tool archive checksum changes, do not bypass verification. Confirm a new version and checksum from the official Android download page, update both pinned values together, and rerun the image build. If Gradle reports a missing SDK package, compare the version against generated Gradle properties before adding the exact package to the Android build stage.

If the Coolify deployment fails, inspect its bounded deployment log through Coolify MCP, fix the branch, push a new commit, and redeploy. If the application becomes unhealthy, use Coolify MCP to restore `git_branch` to `main` and deploy the last accepted revision; do not use direct server access. A failed feature deployment must not be described as published.

## Artifacts and Notes

Initial validated local APK:

    path: apps/client/android/app/build/outputs/apk/release/app-release.apk
    size: approximately 41 MiB
    SHA-256: 5e1cf3e48413f870d3455c015d95fe2602de3f162781d8889e6e408d113614a9

Initial Coolify state:

    application: ek2k3scxtyw65x3a6csxs0tu (thai-ai-translate)
    branch: main
    status: running:healthy
    domain: https://translate.hetz.autismstaking.xyz
    build pack: dockerfile, /Dockerfile

The official Android download page listed command-line tools build `15859902` for Linux with SHA-256 `4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583` during design. Those exact values will be pinned in the Dockerfile.

## Interfaces and Dependencies

`scripts/build-apk.sh` is an executable Bash script with no positional arguments. Its environment interface is `EXPO_PUBLIC_API_BASE_URL` for the non-secret API origin and `APK_OUTPUT_PATH` for the normalized artifact destination. It calls the existing pnpm client build, expects Gradle output at `apps/client/android/app/build/outputs/apk/release/app-release.apk`, and prints the final path, byte count, and SHA-256.

The root `package.json` exposes `build:apk` as `./scripts/build-apk.sh`. The existing `build:android` command remains the lower-level client build, and `scripts/android-s22.sh` remains responsible only for selecting, installing on, and testing a physical S22+.

`apps/api/src/app.ts` registers `GET /apk` only when `config.staticDir` exists and static serving has been decorated. The handler sends static file `thai-ai-translate.apk` with media type `application/vnd.android.package-archive`, a `Content-Disposition` attachment name of `thai-ai-translate.apk`, and `Cache-Control: no-cache` so the stable URL revalidates after deployment.

The Docker Android stage depends on Node 24, pnpm 10.19.0, OpenJDK 17, official Android command-line tools 15859902, platform/build tools 36/36.0.0, NDK 27.1.12297006, and CMake 3.22.1. The final runtime continues to depend only on Node 24 Alpine and curl.

Revision note (2026-08-28 23:56Z): Created the initial self-contained plan after repository inspection, exact Expo SDK 57 documentation review, generated Gradle toolchain inspection, and read-only Coolify MCP discovery. It records the server-side Docker build decision because the Coolify Git build cannot see an ignored local APK and direct non-MCP artifact transfer is prohibited.

Revision note (2026-08-28 23:59Z): Recorded the local Node version mismatch and Fastify static cache-header behavior discovered by the first API test run. The route disables the plugin's generated cache header on that response so the stable download URL can explicitly require revalidation.
