#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf 'Usage: %s [BASE [HEAD]]\n' "${0##*/}" >&2
}

deployment_impact() {
  local path="$1"

  case "$path" in
    Dockerfile|.dockerignore|.npmrc|package.json|pnpm-lock.yaml|pnpm-workspace.yaml)
      printf 'apk\n'
      ;;
    apps/client/*.md|apps/client/LICENSE|apps/client/AGENTS.md|apps/client/CLAUDE.md|\
    apps/client/__tests__/*|apps/client/*/__tests__/*|apps/client/*/*/__tests__/*|\
    apps/client/*.test.*|apps/client/*/*.test.*|apps/client/*/*/*.test.*|\
    apps/client/jest.setup.ts|apps/client/eslint.config.js|apps/client/scripts/*)
      printf 'none\n'
      ;;
    apps/client/*)
      printf 'apk\n'
      ;;
    packages/contracts/*.md|packages/contracts/LICENSE|packages/contracts/AGENTS.md|\
    packages/contracts/CLAUDE.md|packages/contracts/tests/*|\
    packages/contracts/*.test.*|packages/contracts/*/*.test.*)
      printf 'none\n'
      ;;
    packages/contracts/*)
      printf 'apk\n'
      ;;
    scripts/build-apk.sh)
      printf 'apk\n'
      ;;
    apps/api/*.md|apps/api/LICENSE|apps/api/AGENTS.md|apps/api/CLAUDE.md|\
    apps/api/tests/*|apps/api/*.test.*|apps/api/*/*.test.*|\
    apps/api/vitest.config.ts|apps/api/vitest.live.config.ts)
      printf 'none\n'
      ;;
    apps/api/*|config/prompts/*)
      printf 'server\n'
      ;;
    *)
      printf 'none\n'
      ;;
  esac
}

collect_changes() {
  if [[ $# -eq 0 ]]; then
    git diff --name-only HEAD --
    git ls-files --others --exclude-standard
  elif [[ $# -eq 1 ]]; then
    git diff --name-only "$1" --
    git ls-files --others --exclude-standard
  else
    git diff --name-only "$1" "$2" --
  fi
}

main() {
  local path
  local impact
  local deployment='none'
  local apk='none'

  if [[ $# -gt 2 ]]; then
    usage
    exit 2
  fi

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    printf '%s\n' "$path"
    impact="$(deployment_impact "$path")"
    case "$impact" in
      apk)
        deployment='required'
        apk='rebuild'
        ;;
      server)
        deployment='required'
        if [[ "$apk" == 'none' ]]; then
          apk='cached'
        fi
        ;;
    esac
  done < <(collect_changes "$@" | LC_ALL=C sort -u)

  printf 'deployment=%s apk=%s\n' "$deployment" "$apk"
}

main "$@"
