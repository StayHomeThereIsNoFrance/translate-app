#!/usr/bin/env bash

set -euo pipefail

readonly APP_ID='xyz.autismstaking.thaitranslate'
readonly DEFAULT_API_BASE_URL='https://translate.hetz.autismstaking.xyz'
readonly MODEL_PREFIX='SM-S906'
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly APK_PATH="$REPOSITORY_ROOT/apps/client/android/app/build/outputs/apk/release/app-release.apk"
readonly MAESTRO_FLOW="$REPOSITORY_ROOT/.maestro/translate-s22.yml"
readonly E2E_SCREEN_TIMEOUT_MS='600000'

E2E_DEVICE_SERIAL=''
E2E_ORIGINAL_SCREEN_TIMEOUT=''

find_adb() {
  local macos_user_directory
  local sdk_adb

  if [[ -n "${ANDROID_HOME:-}" ]]; then
    sdk_adb="$ANDROID_HOME/platform-tools/adb"
  elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    sdk_adb="$ANDROID_SDK_ROOT/platform-tools/adb"
  else
    macos_user_directory="$(dscacheutil -q user -a name "$(id -un)" | awk '/^dir:/ { print $2; exit }')"
    sdk_adb="$macos_user_directory/Library/Android/sdk/platform-tools/adb"
  fi

  if [[ -x "$sdk_adb" ]]; then
    printf '%s\n' "$sdk_adb"
    return
  fi
  command -v adb || true
}

readonly ADB_BIN="$(find_adb)"

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
    "  EXPO_PUBLIC_API_BASE_URL Override $DEFAULT_API_BASE_URL."
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
  "$ADB_BIN" devices -l
}

device_line() {
  local serial="$1"
  adb_devices | awk -v wanted="$serial" '$1 == wanted { print; exit }'
}

matching_s22_serials() {
  local model
  local serial

  adb_devices | awk '$2 == "device" { print $1 }' | while read -r serial; do
    model="$("$ADB_BIN" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
    if [[ "$model" == "$MODEL_PREFIX"* ]]; then
      printf '%s\n' "$serial"
    fi
  done
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
  model="$("$ADB_BIN" -s "$serial" shell getprop ro.product.model | tr -d '\r')"
  printf 'Selected Galaxy S22+: %s (model %s)\n' "$serial" "$model"
}

configure_android_build_environment() {
  local node24_bin='/opt/homebrew/opt/node@24/bin'
  local android_studio_jdk='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  local user_home_directory

  if [[ -x "$node24_bin/node" ]]; then
    export PATH="$node24_bin:$PATH"
  fi
  require_command node
  require_command pnpm
  [[ "$(node -p 'process.versions.node.split(".")[0]')" == '24' ]] ||
    fail 'Android builds require Node 24. Select Node 24 and retry.'

  if [[ -z "${JAVA_HOME:-}" && -x "$android_studio_jdk/bin/java" ]]; then
    export JAVA_HOME="$android_studio_jdk"
  fi
  [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]] ||
    fail 'Java 17 was not found. Set JAVA_HOME to a JDK 17 installation.'
  [[ "$("$JAVA_HOME/bin/java" -version 2>&1 | awk -F\" '/version/ { print $2; exit }')" == 17.* ]] ||
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
  "$ADB_BIN" -s "$serial" install -r --no-streaming "$APK_PATH"
  "$ADB_BIN" -s "$serial" shell am force-stop "$APP_ID"
  "$ADB_BIN" -s "$serial" shell am start -W -n "$APP_ID/.MainActivity"
  printf 'Launched %s on %s\n' "$APP_ID" "$serial"
}

deploy() {
  local serial

  serial="$(select_s22)"
  build_release_apk
  install_and_launch "$serial"
}

restore_e2e_screen_timeout() {
  if [[ -n "$E2E_DEVICE_SERIAL" && "$E2E_ORIGINAL_SCREEN_TIMEOUT" =~ ^[0-9]+$ ]]; then
    "$ADB_BIN" -s "$E2E_DEVICE_SERIAL" shell settings put system screen_off_timeout "$E2E_ORIGINAL_SCREEN_TIMEOUT" >/dev/null 2>&1 || true
  fi
}

prepare_e2e_phone() {
  local serial="$1"
  local keyguard_state

  E2E_DEVICE_SERIAL="$serial"
  E2E_ORIGINAL_SCREEN_TIMEOUT="$("$ADB_BIN" -s "$serial" shell settings get system screen_off_timeout | tr -d '\r')"
  [[ "$E2E_ORIGINAL_SCREEN_TIMEOUT" =~ ^[0-9]+$ ]] ||
    fail "Could not read the phone's screen timeout."
  trap restore_e2e_screen_timeout EXIT

  "$ADB_BIN" -s "$serial" shell settings put system screen_off_timeout "$E2E_SCREEN_TIMEOUT_MS"
  "$ADB_BIN" -s "$serial" shell input keyevent KEYCODE_WAKEUP
  "$ADB_BIN" -s "$serial" shell wm dismiss-keyguard
  sleep 1
  keyguard_state="$("$ADB_BIN" -s "$serial" shell dumpsys window policy)"
  if grep -q 'showing=true' <<<"$keyguard_state"; then
    fail 'The phone is locked. Unlock the Android system screen and rerun the E2E command.'
  fi
}

run_e2e() {
  local serial

  require_command maestro
  serial="$(select_s22)"
  prepare_e2e_phone "$serial"
  build_release_apk
  install_and_launch "$serial"

  printf 'Running Maestro phrase E2E on %s\n' "$serial"
  maestro --device "$serial" test "$MAESTRO_FLOW"
}

main() {
  local command="${1:-}"
  local endpoint="${2:-}"

  [[ -n "$ADB_BIN" && -x "$ADB_BIN" ]] || fail 'ADB is not installed or not on PATH.'
  "$ADB_BIN" start-server >/dev/null

  case "$command" in
    status)
      [[ $# -eq 1 ]] || fail 'status does not accept arguments.'
      show_status
      ;;
    pair)
      [[ $# -eq 2 ]] || fail 'pair requires HOST:PAIR_PORT.'
      validate_endpoint "$endpoint"
      printf 'Enter the six-digit code shown by Pair device with pairing code.\n'
      "$ADB_BIN" pair "$endpoint"
      printf 'Pairing completed. If status cannot see the phone, run connect with the port from the main Wireless debugging screen.\n'
      ;;
    connect)
      [[ $# -eq 2 ]] || fail 'connect requires HOST:CONNECTION_PORT.'
      validate_endpoint "$endpoint"
      "$ADB_BIN" connect "$endpoint"
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
