#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DEV=0
SKIP_CHECKS=0

for arg in "$@"; do
  case "$arg" in
    --dev)
      RUN_DEV=1
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      ;;
    -h|--help)
      cat <<'HELP'
Usage: scripts/agent-quickstart.sh [--dev] [--skip-checks]

Checks Node/pnpm, installs workspace dependencies with the lockfile, runs practical
verification, and optionally starts the SvelteKit dev server.

Options:
  --dev          Start the local web dev server after setup.
  --skip-checks  Install dependencies but skip pnpm web:check and targeted tests.
HELP
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_command node

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  cat >&2 <<EOF
Node.js 22 or newer is recommended for full UltimateBuild setup.
Detected: $(node --version)

The market package and some tests use node:sqlite, which is available in modern
Node 22 builds. Switch Node versions, then rerun this script.
EOF
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable pnpm >/dev/null 2>&1 || corepack enable
  fi
fi

need_command pnpm

echo "Using Node $(node --version)"
echo "Using pnpm $(pnpm --version)"

if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

if [ "$SKIP_CHECKS" -eq 0 ]; then
  pnpm web:check
  pnpm exec vitest run tests/web.test.ts tests/core.test.ts tests/optimizer.test.ts
else
  echo "Skipping verification because --skip-checks was provided."
fi

if [ "$RUN_DEV" -eq 1 ]; then
  echo "Starting SvelteKit dev server on 127.0.0.1. Vite will print the chosen port."
  exec pnpm --filter @ultimatebuild/web dev
fi

cat <<'EOF'
Setup complete.

Start the local web app with:
  pnpm --filter @ultimatebuild/web dev

Useful follow-up checks:
  pnpm test
  pnpm typecheck
  pnpm web:build
EOF
