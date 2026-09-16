#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly DOCKERFILE="$REPOSITORY_ROOT/Dockerfile"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

apk_stage="$(awk '/^FROM .* AS apk-builder$/ { in_stage=1 } /^FROM / && in_stage && $0 !~ / AS apk-builder$/ { exit } in_stage { print }' "$DOCKERFILE")"
toolchain_stage="$(awk '/^FROM .* AS android-toolchain$/ { in_stage=1 } /^FROM / && in_stage && $0 !~ / AS android-toolchain$/ { exit } in_stage { print }' "$DOCKERFILE")"

grep -q '^FROM pnpm-base AS android-toolchain$' <<<"$toolchain_stage" ||
  fail 'Android toolchain must not inherit application dependencies.'
grep -q 'COPY apps/client apps/client' <<<"$apk_stage" ||
  fail 'APK stage must copy client inputs.'
grep -q 'COPY packages/contracts packages/contracts' <<<"$apk_stage" ||
  fail 'APK stage must copy shared contracts.'
grep -q 'COPY scripts/build-apk.sh scripts/build-apk.sh' <<<"$apk_stage" ||
  fail 'APK stage must copy its build entry point.'
if grep -q 'COPY \. \.' <<<"$apk_stage"; then
  fail 'APK stage must not copy the whole repository.'
fi
if grep -q 'apps/api' <<<"$apk_stage"; then
  fail 'API-only files must not be APK-stage inputs.'
fi

printf 'PASS: Docker APK cache boundaries\n'
