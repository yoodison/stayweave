#!/bin/sh
# Load a user-created credential into this local process only; never print it.
set -eu
if ! command -v security >/dev/null 2>&1; then
  printf '%s\n' 'macOS Keychain is unavailable. Use a local environment variable instead.' >&2
  exit 1
fi
if ! NEBIUS_API_KEY="$(security find-generic-password -s StayWeave-Nebius -a local -w 2>/dev/null)"; then
  printf '%s\n' 'No StayWeave-Nebius credential found in the macOS Keychain.' >&2
  exit 1
fi
if [ -z "$NEBIUS_API_KEY" ]; then
  printf '%s\n' 'The StayWeave-Nebius Keychain entry is empty.' >&2
  exit 1
fi
export NEBIUS_API_KEY
exec npm run dev
