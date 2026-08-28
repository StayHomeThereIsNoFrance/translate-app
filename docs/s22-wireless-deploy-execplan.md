# Deploy automatically and run Android E2E on a Galaxy S22+

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `docs/PLANS.md`.

## Purpose / Big Picture

After this change, a developer can pair the Samsung Galaxy S22+ with this Mac once through Android's Wireless debugging screen and then deploy the current application with one repository command. The command builds a standalone arm64 release APK against the production API, selects the paired S22+ rather than an emulator or another Android device, installs the APK as an update, and opens it. The Android end-to-end test uses the same phone and proves that the phrase `Спасибо` can be translated to `ขอบคุณครับ` in Thai formal mode with the expected Latin and Cyrillic pronunciations.

## Progress

- [x] (2026-08-28 15:39Z) Inspected the Expo build, Android package, existing Maestro flow, Android SDK/JDK/ADB/Maestro tools, repository instructions, and Expo SDK 57 configuration and local-build documentation; created branch `codex/s22-wireless-deploy`.
- [x] (2026-08-28 15:44Z) Added and shell-validated the S22+ pairing, discovery, build, install, and launch script plus root package commands; confirmed that missing-device paths fail with actionable messages.
- [x] (2026-08-28 15:47Z) Added and syntax-checked a separate clean-state S22+ Maestro flow with explicit phrase/result/pronunciation checks; kept the existing emulator fixture flow unchanged.
- [x] (2026-08-28 15:49Z) Updated the root operator guide, architecture verification section, and original test plan with one-time wireless pairing, automatic S22+ deployment, phrase E2E acceptance, and recovery guidance.
- [ ] Pair the actual phone, deploy the APK, and run the phrase E2E on it (completed: paired `SM-S906E`, built/installed/launched version 1.1.0 over Wi-Fi; remaining: rerun the clean-state phrase E2E while the phone is unlocked).
- [ ] Run repository validation, record evidence here, commit each completed milestone, and leave the feature branch unmerged pending user approval (completed: shell and Maestro syntax, lint, type checking, 44 unit tests, production arm64 APK build/inspection, physical deploy; remaining: physical E2E evidence and final branch push).

## Surprises & Discoveries

- Observation: The repository already has a valid arm64 release APK and a Maestro flow for `Спасибо`, but the root E2E command lets Maestro choose any connected Android target and the documentation still describes an emulator.
  Evidence: `package.json` runs `maestro test .maestro/translate.yml`, while `docs/Architecture.md` says the flow runs on an emulator.

- Observation: The existing native fallback API URL is the Android emulator loopback bridge, so an ordinary release build would try to contact the developer's computer through `10.0.2.2` when installed on a real phone.
  Evidence: `apps/client/src/features/translator/api.ts` returns `http://10.0.2.2:3000` when `EXPO_PUBLIC_API_BASE_URL` is absent on native platforms.

- Observation: This Mac already has ADB 36.0.0, Android Studio's JDK 17, and Maestro 2.7.0, but no Android device or `_adb-tls-connect` service is currently visible.
  Evidence: `adb devices -l` and `adb mdns services` both returned no devices, while the tool version commands succeeded.

- Observation: The default shell now resolves Node 26, while this workspace explicitly supports Node 24 only.
  Evidence: `node --version` returned `v26.7.0`; `/opt/homebrew/opt/node@24/bin/node --version` returned `v24.18.0`. The deployment script prepends the installed Node 24 binary and rejects any remaining incompatible runtime.

- Observation: The original Android package command scoped `NODE_ENV=production` only to Expo Prebuild, not to the following Gradle process that creates the JavaScript bundle.
  Evidence: The first physical-phone APK validation printed `The NODE_ENV environment variable is required but was not specified` from Gradle task `:expo-constants:createExpoConfig`. Adding the environment assignment to the Gradle command removes the split-scope configuration.

- Observation: Homebrew ADB 36 could reach the phone's open pairing port but failed the authenticated exchange, while the Android SDK's ADB 37 paired immediately. ADB's long-device listing also renders the hyphen in Samsung model `SM-S906E` as an underscore, even though `ro.product.model` returns the canonical value.
  Evidence: `/opt/homebrew/bin/adb pair` returned `protocol fault (couldn't read status message)` twice. `/Users/j/Library/Android/sdk/platform-tools/adb pair` returned `Successfully paired`, discovered `192.168.1.6:33075`, and `getprop ro.product.model` returned `SM-S906E`.

- Observation: The default Android Studio JDK path contains a space, so invoking `$JAVA_HOME/bin/java` without quoting the complete executable path made the first automatic deploy fail its Java 17 check before building or touching the phone.
  Evidence: `pnpm deploy:android:s22` stopped with `JAVA_HOME must point to JDK 17`; quoting `"$JAVA_HOME/bin/java"` makes the same check resolve Android Studio's OpenJDK 17 correctly.

- Observation: The first ADB installation paused after transferring the APK because the locked phone had opened a Google Play Protect confirmation under the lock screen.
  Evidence: `dumpsys window` reported `com.google.android.finsky.protectdialogs.activity.PlayProtectDialogsActivity`; after the user unlocked and approved the locally signed preview, ADB returned `Success` and launched `.MainActivity`.

- Observation: The first physical E2E attempt did not reach the application because the phone slept and Android's system keyguard covered the activity.
  Evidence: Maestro failed its initial title assertion, while `dumpsys window` reported `NotificationShade`, `showing=true`, and `SCREEN_STATE_OFF`. This was a device-lock failure, not application authentication.

- Observation: Even when the phone was unlocked immediately before the retry, its short screen timeout elapsed while Maestro initialized its Android driver.
  Evidence: The preflight reported `showing=false` and `SCREEN_STATE_ON`; by the first title assertion Android again reported `showing=true`, `SCREEN_STATE_OFF`, and `NotificationShade` above the still-focused application.

## Decision Log

- Decision: Use Android 11+ Wireless debugging pairing rather than a permanently attached USB cable.
  Rationale: The S22+ and Mac are on the same Wi-Fi network, and authenticated wireless ADB preserves the requested one-command deployment workflow after a one-time pairing action on the phone.
  Date/Author: 2026-08-28 / Codex

- Decision: Select the target by the Galaxy S22+ model family `SM-S906*`, while allowing an explicit `ANDROID_DEVICE_SERIAL` override.
  Rationale: A model check prevents silently deploying to an emulator or unrelated phone. The serial override makes recovery possible if Samsung or ADB reports an unexpected model string, without weakening the safe default.
  Date/Author: 2026-08-28 / Codex

- Decision: Prefer the ADB executable installed inside the configured Android SDK over another `adb` earlier on `PATH`, and identify the model with `ro.product.model`.
  Rationale: The Android SDK is the build toolchain already required by this repository and contains the working ADB 37 pairing implementation. Querying the property avoids ADB's underscore normalization in `devices -l` while still safely selecting only the S22+.
  Date/Author: 2026-08-28 / Codex

- Decision: Build the installed preview with `EXPO_PUBLIC_API_BASE_URL=https://translate.hetz.autismstaking.xyz` unless the caller explicitly provides another URL.
  Rationale: A physical phone cannot use the emulator-only `10.0.2.2` fallback. The HTTPS production origin yields a standalone APK that keeps working when the build process exits and does not require cleartext network permission.
  Date/Author: 2026-08-28 / Codex

- Decision: Run Maestro with an explicit `--device` value returned by the same S22+ discovery routine used for installation.
  Rationale: Installation and UI automation must operate on the identical physical handset even when an emulator or another device is also connected.
  Date/Author: 2026-08-28 / Codex

- Decision: Exercise the production translation directly, without an access-code step or secret environment variable.
  Rationale: The deployed application is available without an access-code prompt, so the physical-device flow should model the real user journey and remain runnable as one command.
  Date/Author: 2026-08-29 / Codex

- Decision: Temporarily extend the phone's screen timeout to ten minutes for the E2E command and restore the original value from an exit trap.
  Rationale: Maestro driver initialization can exceed the phone's normal timeout. A bounded, reversible setting prevents the system keyguard from covering the app without weakening the user's lock configuration after the run.
  Date/Author: 2026-08-29 / Codex

## Outcomes & Retrospective

Repository-side automation and documentation are implemented. Shell and Maestro syntax checks, lint, type checking, all 44 unit tests, and the production arm64 APK build pass. The inspected APK has the expected package, version, SDK levels, ABI, valid signature, and embedded production HTTPS origin. Wireless pairing and one-command physical deployment now work on the user's `SM-S906E`; Android reports version 1.1.0, version code 2, and arm64 ABI installed and launched. The clean-state phrase E2E now follows the direct translation journey and remains to be rerun while the phone is unlocked.

## Context and Orientation

This is a pnpm workspace. `apps/client` is an Expo SDK 57 React Native application. `apps/client/app.json` declares Android application ID `xyz.autismstaking.thaitranslate`, version `1.1.0`, version code `2`, and an arm64-compatible native build. `apps/client/package.json` generates the ignored `apps/client/android` project through Expo Prebuild and assembles `apps/client/android/app/build/outputs/apk/release/app-release.apk`. The root `package.json` provides developer commands.

ADB, the Android Debug Bridge, is the Android SDK command-line service that pairs with the phone, installs APK files, launches activities, and exposes the phone to test tools. Wireless debugging is Android's authenticated ADB-over-Wi-Fi mode. Pairing is the one-time trust exchange made with the IP address, pairing port, and six-digit code shown on the phone. After pairing, the phone publishes a separate connection endpoint; modern ADB usually connects to it automatically through multicast DNS, abbreviated mDNS. If automatic discovery fails, the phone's main Wireless debugging screen shows the IP address and connection port for an explicit `adb connect` command.

Maestro is the existing Android UI automation tool. `.maestro/translate.yml` is the existing emulator flow. `.maestro/translate-s22.yml` is the physical-phone flow: it launches the installed application, enters `Спасибо`, requests a translation directly, and checks the Thai result plus the presence of both pronunciation sections.

The repository instructions require feature work on a separate branch with milestone commits. No client UI changes are needed, so Coolify browser UI deployment is outside this work. The default branch is `main`; this branch must remain unmerged until the user approves it.

## Plan of Work

First, create `scripts/android-s22.sh` as the single implementation point for device operations. It will provide `status`, `pair`, `connect`, `deploy`, and `e2e` actions. Every action that operates on a device will query `adb devices -l`, accept only a fully authorized target whose model begins with `SM-S906`, reject ambiguity, and honor `ANDROID_DEVICE_SERIAL` only after verifying that the chosen serial is online. `pair` will delegate the six-digit prompt to `adb pair` so the code is not passed as a command argument. `connect` will accept the connection endpoint displayed on the phone.

The deploy action will set a non-secret default `EXPO_PUBLIC_API_BASE_URL`, run the existing arm64 release build under the repository's Node 24, Android SDK 36, and JDK 17 requirements, verify that the APK exists, install it with `adb install -r`, stop any old process, and launch the package's launcher activity. It will not clear application data, so a user's stored preferences and Android bearer session survive normal deployments. Root package commands will expose the actions without requiring callers to remember script paths.

Second, add `.maestro/translate-s22.yml` as a clean and explicit physical-device smoke test without changing the existing deterministic emulator flow. The S22+ flow will choose Thai formal and male speaker controls, translate `Спасибо` directly, assert `ขอบคุณครับ`, and confirm both pronunciation sections are populated. The script's `e2e` action will verify that the phone is unlocked, temporarily extend and later restore its screen timeout, deploy the current APK, and invoke Maestro with `--device <selected-serial>` so the test cannot drift to an emulator.

Third, update `README.md`, `docs/Architecture.md`, and the test-plan section in `docs/initplan.md`. The documentation will explain the exact Samsung menu path, the distinction between pairing and connection ports, pairing and reconnect commands, automatic deployment, direct clean-state E2E, expected output, and recovery for `unauthorized`, `offline`, lost Wi-Fi pairing, multiple devices, and install version conflicts.

Finally, validate shell syntax and failure behavior before the phone is available. Run lint, type checking, unit tests, and relevant configuration checks. Ask the user to enable Developer options and Wireless debugging and to provide the short-lived pairing endpoint/code when ready. Pair the phone, confirm the reported model, deploy the release APK, run the phrase E2E, and capture concise evidence in this plan. Commit each milestone independently.

## Concrete Steps

Run all commands from `/Users/j/translate-app`. The branch is already created:

    git switch codex/s22-wireless-deploy

Inspect the current target state without changing the phone:

    pnpm android:s22:status

On the phone, open Settings, About phone, Software information, and tap Build number seven times if Developer options is not enabled. Then open Settings, Developer options, Wireless debugging, enable it, and choose Pair device with pairing code. With the temporary endpoint shown there, run:

    pnpm android:s22:pair -- 192.168.1.X:PAIRING_PORT

Enter the six-digit code only at ADB's prompt. If `pnpm android:s22:status` still shows no S22+, use the distinct endpoint on the main Wireless debugging screen:

    pnpm android:s22:connect -- 192.168.1.X:CONNECTION_PORT

After `status` identifies a single `SM-S906*` device, build, install, and launch the current branch:

    pnpm deploy:android:s22

The expected ending states that the APK was installed and package `xyz.autismstaking.thaitranslate` was launched on the selected S22+ serial. Run the clean-state phrase E2E:

    pnpm test:e2e:android:s22

The command should be started while the phone is unlocked. It should finish with one passing Maestro flow, name the same phone serial used during installation, and restore the phone's previous screen timeout on exit.

Validate repository behavior:

    bash -n scripts/android-s22.sh
    pnpm lint
    pnpm typecheck
    pnpm test:unit
    git diff --check

Inspect and commit only files belonging to each milestone:

    git status --short
    git add <milestone files>
    git commit -m "<milestone description>"

## Validation and Acceptance

Before pairing, `pnpm android:s22:status` must explain that no matching online Galaxy S22+ is available and return a nonzero exit status for commands that require one. Shell syntax validation must succeed. A device reported as an emulator, an unauthorized phone, or a non-S22+ model must not be selected automatically.

After pairing, `pnpm android:s22:status` must display one online target whose model starts with `SM-S906`. `pnpm deploy:android:s22` must produce an arm64 release APK, report `Success` from ADB installation, and leave `xyz.autismstaking.thaitranslate` in the resumed foreground state. Opening the app on the phone must reach the HTTPS production service rather than `10.0.2.2`.

`pnpm test:e2e:android:s22` must reinstall the current APK and run Maestro only on that phone. Starting from cleared app state, the flow must translate `Спасибо` in Thai formal male mode, display `ขอบคุณครับ`, and display non-empty Latin and Cyrillic pronunciation sections. An unavailable API, unexpected live model output, or lost device connection must make the command fail rather than report a false pass.

Repository acceptance also requires lint, type checking, unit tests, and `git diff --check` to succeed. Because no client UI is changed, no Coolify branch UI deployment is needed for this feature.

## Idempotence and Recovery

Status checks, ADB pairing attempts, explicit connection, release builds, and `adb install -r` are safe to repeat. The `-r` flag updates the installed package while retaining application data during ordinary deploys. The Maestro flow deliberately clears data so the authentication and translation journey starts predictably; this removes only this app's local preferences and token on the test phone.

If the phone is `unauthorized`, accept the trust prompt on the phone or revoke Wireless debugging authorizations and pair again. If it is `offline`, toggle Wireless debugging or run the explicit connection command with the current connection port. If more than one S22+ is online, set `ANDROID_DEVICE_SERIAL` to the exact serial printed by `adb devices -l`. If ADB reports a version downgrade, increment `android.versionCode` only for a real release or manually remove the preview package after confirming with the user that clearing its local data is acceptable; the automation will not uninstall automatically.

If build generation fails, the native `apps/client/android` directory is ignored and can be regenerated by rerunning the build. No pairing credential, phone IP, or ADB serial will be written to tracked files.

## Artifacts and Notes

Initial environment evidence:

    $ adb version
    Android Debug Bridge version 1.0.41
    Version 36.0.0-13206524

    $ maestro --version
    2.7.0

    $ adb devices -l
    List of devices attached

The current output APK path is:

    apps/client/android/app/build/outputs/apk/release/app-release.apk

Validated APK evidence:

    package: xyz.autismstaking.thaitranslate
    version: 1.1.0 (versionCode 2)
    min/target SDK: 24/36
    ABI: arm64-v8a
    signature: APK Signature Scheme v2 verified
    SHA-256 of the installed build: 5c7adba8eda79d5cf79e82464f3033b27c68d330d94d843ab94983e13d122da6

Repository verification before physical pairing passed 5 contract, 22 API, and 17 client unit tests, for 44 total tests. The first clean Android build completed in 8 minutes 33 seconds; the corrected production-mode Gradle rerun completed successfully without the `NODE_ENV` warning.

Physical deployment evidence:

    device: adb-RFCT60EX4DB-c8dtcQ._adb-tls-connect._tcp
    model: SM-S906E
    connection: authenticated wireless ADB at 192.168.1.6
    install result: Success
    installed version: 1.1.0 (versionCode 2), arm64-v8a
    launched activity: xyz.autismstaking.thaitranslate/.MainActivity

The production Android API origin embedded during deployment is:

    https://translate.hetz.autismstaking.xyz

## Interfaces and Dependencies

`scripts/android-s22.sh` must be a Bash-compatible executable. Its public interface is `scripts/android-s22.sh <status|pair|connect|deploy|e2e> [endpoint]`. It depends only on Bash, ADB, pnpm, the existing Expo/Gradle build, Java 17, Android SDK 36, and Maestro 2.7.0. Device selection reads the serial and `model:` fields from `adb devices -l`. `ANDROID_DEVICE_SERIAL` selects an explicit online target. `EXPO_PUBLIC_API_BASE_URL` can override the non-secret production default. The `e2e` action requires an unlocked phone, saves its numeric `screen_off_timeout`, sets a temporary ten-minute timeout, and restores the saved value through an exit trap.

The root `package.json` must expose `android:s22:status`, `android:s22:pair`, `android:s22:connect`, `deploy:android:s22`, and `test:e2e:android:s22`. The existing package ID and APK output path remain unchanged. `.maestro/translate-s22.yml` is the physical phrase-flow source and runs without secret inputs.

Revision note (2026-08-28 15:39Z): Created the initial self-contained plan after repository, toolchain, network-discovery, and Expo SDK 57 documentation review. It records the production-HTTPS build decision because the native fallback `10.0.2.2` is emulator-specific and cannot serve a standalone physical-phone deployment.

Revision note (2026-08-28 15:44Z): Marked the repository deployment automation milestone complete after shell syntax, help output, root-command wiring, and intentional no-device failures were verified. Recorded Node 26 discovery and the script's automatic Node 24 selection.

Revision note (2026-08-28 15:47Z): Added a separate S22+ production flow so the existing emulator fixture flow remains deterministic. Narrowed live pronunciation acceptance to visible populated sections because the model may use different valid learner-friendly transliterations.

Revision note (2026-08-28 15:49Z): Marked documentation complete after adding the physical S22+ phrase test to `docs/initplan.md` and documenting pairing, deploy, test, target selection, and recovery in the root guide and architecture.

Revision note (2026-08-28 15:59Z): Recorded the successful first arm64 APK build and its `NODE_ENV` scope warning. Updated both Android build variants so the Gradle bundling phase is explicitly production-mode as well as the Expo Prebuild phase.

Revision note (2026-08-28 16:01Z): Added pre-device validation evidence and APK metadata. The only remaining acceptance work required the user to enable Wireless debugging for pairing and run the clean-state phrase flow.

Revision note (2026-08-28 16:08Z): Recorded successful pairing and hardened the automation to prefer Android SDK ADB 37 after Homebrew ADB 36 failed against the reachable phone. Changed model discovery to the canonical device property because ADB normalizes the Samsung model punctuation in its listing.

Revision note (2026-08-28 16:10Z): Recorded and fixed the first deploy preflight failure caused by the space in Android Studio's JDK path. No build, installation, or phone mutation occurred before the corrected retry.

Revision note (2026-08-28 16:18Z): Recorded successful one-command build, wireless installation, and launch on the paired `SM-S906E`, including the one-time Google Play Protect confirmation. The only remaining physical check is the direct production phrase E2E.

Revision note (2026-08-29): Removed the access-code assumption from the S22+ flow, script, and operator documentation after confirming with the user that the application opens without it. Recorded that the first test retry was blocked only by Android's system keyguard.

Revision note (2026-08-29): Hardened the E2E command after an unlocked retry slept during Maestro initialization. The command now keeps the screen awake for the bounded run and restores the user's prior timeout even when the test fails.
