#!/usr/bin/env bash

set -euo pipefail

readonly APP_ID='xyz.autismstaking.thaitranslate'
readonly DEFAULT_API_BASE_URL='https://translate.hetz.autismstaking.xyz'
readonly MODEL_PREFIX='SM-S906'
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly APK_PATH="$REPOSITORY_ROOT/apps/client/android/app/build/outputs/apk/release/app-release.apk"
readonly MAESTRO_FLOW="$REPOSITORY_ROOT/.maestro/translate-s22.yml"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: scripts/android-s22.sh <command> [endpoint]' \
    '' \
    'Commands:' \
    '  status                  Show ADB devices and the selected Galaxy S22+.' \
    '  pair HOST:PAIR_PORT     Pair once; enter the six-digit code at the ADB prompt.' \
    '  connect HOST:PORT       Connect when ADB mDNS discovery did not reconnect.' \
    '  deploy                  Build, install, and launch the release APK.' \
    '  e2e                     Deploy, then run the phrase flow on the same phone.' \
    '' \
    'Optional environment:' \
    '  ANDROID_DEVICE_SERIAL   Select one exact online ADB serial.' \
    "  EXPO_PUBLIC_API_BASE_URL Override $DEFAULT_API_BASE_URL." \
    '  APP_ACCESS_PIN          Required by e2e; never written to a file.'
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' is not installed or not on PATH."
}

validate_endpoint() {
  local endpoint="$1"
  [[ "$endpoint" =~ ^[^[:space:]:]+:[0-9]+$ ]] ||
    fail "Expected HOST:PORT, got '$endpoint'."
}

adb_devices() {
  adb devices -l
}

device_line() {
  local serial="$1"
  adb_devices | awk -v wanted="$serial" '$1 == wanted { print; exit }'
}

matching_s22_serials() {
  adb_devices | awk -v prefix="$MODEL_PREFIX" '
    $2 == "device" {
      for (field_index = 3; field_index <= NF; field_index += 1) {
        if ($field_index ~ /^model:/) {
          model = substr($field_index, 7)
          if (index(model, prefix) == 1) {
            print $1
          }
        }
      }
    }
  '
}

select_s22() {
  local selected_line
  local serials
  local count

  if [[ -n "${ANDROID_DEVICE_SERIAL:-}" ]]; then
    selected_line="$(device_line "$ANDROID_DEVICE_SERIAL")"
    [[ -n "$selected_line" ]] ||
      fail "ANDROID_DEVICE_SERIAL '$ANDROID_DEVICE_SERIAL' is not reported by ADB."
    [[ "$(awk '{ print $2 }' <<<"$selected_line")" == 'device' ]] ||
      fail "ANDROID_DEVICE_SERIAL '$ANDROID_DEVICE_SERIAL' is not online: $selected_line"
    printf '%s\n' "$ANDROID_DEVICE_SERIAL"
    return
  fi

  serials="$(matching_s22_serials)"
  count="$(printf '%s\n' "$serials" | awk 'NF { count += 1 } END { print count + 0 }')"

  if [[ "$count" -eq 0 ]]; then
    adb_devices >&2
    fail "No online Galaxy S22+ ($MODEL_PREFIX*) is available. Enable Wireless debugging, then run the pair/connect command."
  fi
  if [[ "$count" -gt 1 ]]; then
    printf '%s\n' "$serials" >&2
    fail 'More than one Galaxy S22+ is online. Set ANDROID_DEVICE_SERIAL to the intended serial.'
  fi

  printf '%s\n' "$serials"
}

show_status() {
  local serial
  local model

  printf 'ADB devices:\n'
  adb_devices
  printf '\n'
  serial="$(select_s22)"
  model="$(adb -s "$serial" shell getprop ro.product.model | tr -d '\r')"
  printf 'Selected Galaxy S22+: %s (model %s)\n' "$serial" "$model"
}

configure_android_build_environment() {
  local node24_bin='/opt/homebrew/opt/node@24/bin'
  local android_studio_jdk='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  local user_home_directory

  require_command node
  require_command pnpm
  if [[ -x "$node24_bin/node" ]]; then
    export PATH="$node24_bin:$PATH"
  fi
  [[ "$(node -p 'process.versions.node.split(".")[0]')" == '24' ]] ||
    fail 'Android builds require Node 24. Select Node 24 and retry.'

  if [[ -z "${JAVA_HOME:-}" && -x "$android_studio_jdk/bin/java" ]]; then
    export JAVA_HOME="$android_studio_jdk"
  fi
  [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]] ||
    fail 'Java 17 was not found. Set JAVA_HOME to a JDK 17 installation.'
  [[ "$($JAVA_HOME/bin/java -version 2>&1 | awk -F\" '/version/ { print $2; exit }')" == 17.* ]] ||
    fail 'JAVA_HOME must point to JDK 17.'

  if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
      export ANDROID_HOME="$ANDROID_SDK_ROOT"
    else
      user_home_directory="$(dscacheutil -q user -a name "$(id -un)" | awk '/^dir:/ { print $2; exit }')"
      [[ -n "$user_home_directory" ]] || fail 'Could not determine the macOS user directory for Android SDK discovery.'
      export ANDROID_HOME="$user_home_directory/Library/Android/sdk"
    fi
  fi
  [[ -d "$ANDROID_HOME" ]] ||
    fail "Android SDK was not found at '$ANDROID_HOME'. Set ANDROID_HOME and retry."
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
}

build_release_apk() {
  configure_android_build_environment
  export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-$DEFAULT_API_BASE_URL}"

  printf 'Building arm64 release APK for API %s\n' "$EXPO_PUBLIC_API_BASE_URL"
  (
    cd "$REPOSITORY_ROOT"
    pnpm build:android
  )
  [[ -f "$APK_PATH" ]] || fail "Android build completed without producing '$APK_PATH'."
}

install_and_launch() {
  local serial="$1"

  printf 'Installing %s on %s\n' "$APK_PATH" "$serial"
  adb -s "$serial" install -r --no-streaming "$APK_PATH"
  adb -s "$serial" shell am force-stop "$APP_ID"
  adb -s "$serial" shell am start -W -n "$APP_ID/.MainActivity"
  printf 'Launched %s on %s\n' "$APP_ID" "$serial"
}

deploy() {
  local serial

  serial="$(select_s22)"
  build_release_apk
  install_and_launch "$serial"
}

run_e2e() {
  local serial

  [[ -n "${APP_ACCESS_PIN:-}" ]] ||
    fail 'APP_ACCESS_PIN is required for the clean-state production E2E flow.'
  require_command maestro
  serial="$(select_s22)"
  build_release_apk
  install_and_launch "$serial"

  export MAESTRO_APP_ACCESS_PIN="$APP_ACCESS_PIN"
  printf 'Running Maestro phrase E2E on %s\n' "$serial"
  maestro --device "$serial" test "$MAESTRO_FLOW"
}

main() {
  local command="${1:-}"
  local endpoint="${2:-}"

  require_command adb
  adb start-server >/dev/null

  case "$command" in
    status)
      [[ $# -eq 1 ]] || fail 'status does not accept arguments.'
      show_status
      ;;
    pair)
      [[ $# -eq 2 ]] || fail 'pair requires HOST:PAIR_PORT.'
      validate_endpoint "$endpoint"
      printf 'Enter the six-digit code shown by Pair device with pairing code.\n'
      adb pair "$endpoint"
      printf 'Pairing completed. If status cannot see the phone, run connect with the port from the main Wireless debugging screen.\n'
      ;;
    connect)
      [[ $# -eq 2 ]] || fail 'connect requires HOST:CONNECTION_PORT.'
      validate_endpoint "$endpoint"
      adb connect "$endpoint"
      show_status
      ;;
    deploy)
      [[ $# -eq 1 ]] || fail 'deploy does not accept arguments.'
      deploy
      ;;
    e2e)
      [[ $# -eq 1 ]] || fail 'e2e does not accept arguments.'
      run_e2e
      ;;
    help|-h|--help|'')
      usage
      ;;
    *)
      usage >&2
      fail "Unknown command '$command'."
      ;;
  esac
}

main "$@"
