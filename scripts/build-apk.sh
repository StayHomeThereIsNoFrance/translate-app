#!/usr/bin/env bash

set -euo pipefail

readonly DEFAULT_API_BASE_URL='https://translate.hetz.autismstaking.xyz'
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly GRADLE_APK_PATH="$REPOSITORY_ROOT/apps/client/android/app/build/outputs/apk/release/app-release.apk"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    fail "Required command '$1' is not installed or not on PATH."
}

configure_build_environment() {
  local android_studio_jdk='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  local macos_node24_bin='/opt/homebrew/opt/node@24/bin'
  local macos_user_directory
  local java_version

  if [[ -x "$macos_node24_bin/node" ]]; then
    export PATH="$macos_node24_bin:$PATH"
  fi
  require_command node
  require_command pnpm
  [[ "$(node -p 'process.versions.node.split(".")[0]')" == '24' ]] ||
    fail 'APK builds require Node 24. Select Node 24 and retry.'

  if [[ -z "${JAVA_HOME:-}" && -x "$android_studio_jdk/bin/java" ]]; then
    export JAVA_HOME="$android_studio_jdk"
  fi
  [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]] ||
    fail 'Java 17 was not found. Set JAVA_HOME to a JDK 17 installation.'
  java_version="$("$JAVA_HOME/bin/java" -version 2>&1 | awk -F\" '/version/ { print $2; exit }')"
  [[ "$java_version" == 17.* ]] ||
    fail 'JAVA_HOME must point to JDK 17.'
  if [[ "$(uname -s)" == 'Darwin' && "$java_version" == 17.0.10* ]]; then
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }-XX:-TieredCompilation"
  fi

  if [[ -z "${ANDROID_HOME:-}" ]]; then
    if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
      export ANDROID_HOME="$ANDROID_SDK_ROOT"
    elif [[ "$(uname -s)" == 'Darwin' ]]; then
      macos_user_directory="$(dscacheutil -q user -a name "$(id -un)" | awk '/^dir:/ { print $2; exit }')"
      [[ -n "$macos_user_directory" ]] ||
        fail 'Could not determine the macOS user directory for Android SDK discovery.'
      export ANDROID_HOME="$macos_user_directory/Library/Android/sdk"
    else
      fail 'Android SDK was not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.'
    fi
  fi
  [[ -d "$ANDROID_HOME" ]] ||
    fail "Android SDK was not found at '$ANDROID_HOME'. Set ANDROID_HOME and retry."
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
}

sha256_digest() {
  local file_path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{ print $1 }'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{ print $1 }'
    return
  fi
  fail 'Neither sha256sum nor shasum is available.'
}

main() {
  local output_path="${APK_OUTPUT_PATH:-$REPOSITORY_ROOT/dist/apk/thai-ai-translate.apk}"
  local output_directory
  local output_size
  local output_sha256

  [[ $# -eq 0 ]] || fail 'build-apk.sh does not accept positional arguments.'
  configure_build_environment
  export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-$DEFAULT_API_BASE_URL}"

  if [[ "$output_path" != /* ]]; then
    output_path="$REPOSITORY_ROOT/$output_path"
  fi
  output_directory="$(dirname "$output_path")"

  printf 'Building arm64 release APK for API %s\n' "$EXPO_PUBLIC_API_BASE_URL"
  (
    cd "$REPOSITORY_ROOT"
    pnpm build:android
  )
  [[ -s "$GRADLE_APK_PATH" ]] ||
    fail "Android build completed without producing '$GRADLE_APK_PATH'."

  mkdir -p "$output_directory"
  if [[ "$GRADLE_APK_PATH" != "$output_path" ]]; then
    cp "$GRADLE_APK_PATH" "$output_path"
  fi
  [[ -s "$output_path" ]] || fail "APK output '$output_path' is empty."

  output_size="$(wc -c < "$output_path" | tr -d '[:space:]')"
  output_sha256="$(sha256_digest "$output_path")"
  printf 'APK: %s\n' "$output_path"
  printf 'Bytes: %s\n' "$output_size"
  printf 'SHA-256: %s\n' "$output_sha256"
}

main "$@"
