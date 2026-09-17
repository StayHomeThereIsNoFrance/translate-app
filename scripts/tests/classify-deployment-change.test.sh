#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly CLASSIFIER="$REPOSITORY_ROOT/scripts/classify-deployment-change.sh"
fixture=''

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_classification() {
  local expected="$1"
  shift
  local actual

  actual="$($CLASSIFIER "$@" | tail -n 1)"
  [[ "$actual" == "$expected" ]] ||
    fail "expected '$expected', got '$actual' for revisions: $*"
}

main() {
  local base
  local docs_commit
  local server_commit
  local apk_commit
  local merge_commit

  fixture="$(mktemp -d "${TMPDIR:-/tmp}/deployment-impact.XXXXXX")"
  trap 'rm -rf "$fixture"' EXIT

  git -C "$fixture" init --quiet
  git -C "$fixture" config user.email 'deployment-test@example.invalid'
  git -C "$fixture" config user.name 'Deployment Test'

  mkdir -p "$fixture/docs" "$fixture/apps/api/src" "$fixture/apps/client/src"
  printf 'base\n' > "$fixture/README.md"
  git -C "$fixture" add .
  git -C "$fixture" commit --quiet -m base
  base="$(git -C "$fixture" rev-parse HEAD)"

  printf 'plan\n' > "$fixture/docs/plan.md"
  git -C "$fixture" add .
  git -C "$fixture" commit --quiet -m docs
  docs_commit="$(git -C "$fixture" rev-parse HEAD)"
  (
    cd "$fixture"
    assert_classification 'deployment=none apk=none' "$base" "$docs_commit"
  )

  printf 'server\n' > "$fixture/apps/api/src/server.ts"
  git -C "$fixture" add .
  git -C "$fixture" commit --quiet -m server
  server_commit="$(git -C "$fixture" rev-parse HEAD)"
  (
    cd "$fixture"
    assert_classification 'deployment=required apk=cached' "$docs_commit" "$server_commit"
  )

  printf 'client\n' > "$fixture/apps/client/src/app.tsx"
  git -C "$fixture" add .
  git -C "$fixture" commit --quiet -m client
  apk_commit="$(git -C "$fixture" rev-parse HEAD)"
  (
    cd "$fixture"
    assert_classification 'deployment=required apk=rebuild' "$server_commit" "$apk_commit"
  )

  git -C "$fixture" switch --quiet -c merge-target "$base"
  git -C "$fixture" switch --quiet -c feature
  mkdir -p "$fixture/apps/client/src"
  printf 'feature\n' > "$fixture/apps/client/src/feature.tsx"
  git -C "$fixture" add .
  git -C "$fixture" commit --quiet -m feature
  git -C "$fixture" switch --quiet merge-target
  git -C "$fixture" merge --quiet --no-ff feature -m merge
  merge_commit="$(git -C "$fixture" rev-parse HEAD)"
  (
    cd "$fixture"
    assert_classification 'deployment=none apk=none' feature "$merge_commit"
  )

  printf 'PASS: deployment change classification\n'
}

main "$@"
