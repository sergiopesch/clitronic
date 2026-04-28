#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RUN_DIR="${AUTORESEARCH_RUN_DIR:-autoresearch/runs/$TIMESTAMP}"
mkdir -p "$RUN_DIR"

export AUTORESEARCH_RUN_DIR="$RUN_DIR"
export AUTORESEARCH_TRACE_FILE="$ROOT_DIR/$RUN_DIR/trace.jsonl"
export CLITRONIC_AUTORESEARCH=1

: > "$RUN_DIR/checks.jsonl"
: > "$RUN_DIR/trace.jsonl"

run_check() {
  local name="$1"
  shift
  local log_file="$RUN_DIR/${name}.log"
  set +e
  "$@" 2>&1 | tee "$log_file"
  local status="${PIPESTATUS[0]}"
  set -e
  node -e "const fs=require('fs'); fs.appendFileSync(process.argv[1], JSON.stringify({name:process.argv[2], status:Number(process.argv[3]), log:process.argv[4], ts:new Date().toISOString()})+'\\n')" "$RUN_DIR/checks.jsonl" "$name" "$status" "$log_file"
  if [ "$status" -ne 0 ]; then
    echo "Check failed: $name" >&2
    exit "$status"
  fi
}

run_check validate npm run validate
run_check test npm test

if [ "${AUTORESEARCH_SKIP_BUILD:-0}" = "1" ]; then
  node -e "const fs=require('fs'); fs.appendFileSync(process.argv[1], JSON.stringify({name:'build', status:0, skipped:true, reason:'AUTORESEARCH_SKIP_BUILD=1', ts:new Date().toISOString()})+'\\n')" "$RUN_DIR/checks.jsonl"
else
  run_check build npm run build
fi

npx tsx autoresearch/run_quality_harness.ts
npx tsx autoresearch/score_quality.ts
