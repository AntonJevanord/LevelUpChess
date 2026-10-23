#!/usr/bin/env bash
# Static table checks; no engine searches or balance games.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_archive="$repo_root/vendor/ffish-es6-0.7.10-source.tar.gz"
source_patch="$repo_root/stockfish/patches/manual-piece-value-overrides.patch"
compiler="${CXX:-g++}"
command -v "$compiler" >/dev/null
printf '%s  %s\n' 52b080d823fd4785a598e4201ab26be2752bdbc093b8c9a9a47b99de13a65a86 "$source_archive" | sha256sum --check --status
printf '%s  %s\n' 6074fdd1a8f1bed8473801c0f41086f9d09872ec4f6847d13ee99abf44544722 "$source_patch" | sha256sum --check --status
check_dir="$(mktemp -d "${TMPDIR:-/tmp}/levelup-values-check.XXXXXXXX")"
trap 'rm -rf -- "$check_dir"' EXIT
tar -xzf "$source_archive" --strip-components=1 -C "$check_dir"
patch --directory="$check_dir" --strip=1 --fuzz=0 < "$source_patch"
"$compiler" -std=c++17 -O0 -ffunction-sections -fdata-sections -I"$check_dir/src" \
  "$repo_root/stockfish/patches/verify-piece-values.cpp" -Wl,--gc-sections -o "$check_dir/check-values"
"$check_dir/check-values"
