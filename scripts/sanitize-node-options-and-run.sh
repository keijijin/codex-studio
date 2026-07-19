#!/usr/bin/env bash
# Strip Electron-only flags before starting host Node (NODE_OPTIONS is parsed pre-JS).
set -euo pipefail
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  cleaned=()
  # shellcheck disable=SC2206
  for opt in $NODE_OPTIONS; do
    [[ "$opt" == "--use-system-ca" ]] && continue
    cleaned+=("$opt")
  done
  if ((${#cleaned[@]} > 0)); then
    export NODE_OPTIONS="${cleaned[*]}"
  else
    unset NODE_OPTIONS
  fi
fi
exec "$@"
