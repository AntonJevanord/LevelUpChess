#!/usr/bin/env bash
# Cross-build the bundled Windows engine from the matching, vendored GPL source.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_archive="$repo_root/vendor/ffish-es6-0.7.10-source.tar.gz"
archive_sha256=52b080d823fd4785a598e4201ab26be2752bdbc093b8c9a9a47b99de13a65a86
source_patch="$repo_root/stockfish/patches/manual-piece-value-overrides.patch"
patch_sha256=6074fdd1a8f1bed8473801c0f41086f9d09872ec4f6847d13ee99abf44544722
output_path="${1:-$repo_root/stockfish/fairy-stockfish-levelup_x86-64.exe}"
compiler="${MINGW_CXX:-x86_64-w64-mingw32-g++}"
strip_tool="${MINGW_STRIP:-x86_64-w64-mingw32-strip}"

if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [output.exe]\n' "$0" >&2
  exit 2
fi
command -v "$compiler" >/dev/null
command -v "$strip_tool" >/dev/null
command -v patch >/dev/null
printf '%s  %s\n' "$archive_sha256" "$source_archive" | sha256sum --check --status
printf '%s  %s\n' "$patch_sha256" "$source_patch" | sha256sum --check --status

build_dir="$(mktemp -d "${TMPDIR:-/tmp}/levelup-windows.XXXXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT
tar -xzf "$source_archive" --strip-components=1 -C "$build_dir"
patch --directory="$build_dir" --strip=1 --fuzz=0 < "$source_patch"

# Fix __DATE__ and the stripped PE timestamp to the upstream commit time.
export SOURCE_DATE_EPOCH=1787486918
export TZ=UTC
export LC_ALL=C
make -C "$build_dir/src" -j"${JOBS:-2}" \
  ARCH=x86-64 COMP=mingw COMPCXX="$compiler" nnue=no \
  EXTRALDFLAGS=-Wl,--no-insert-timestamp build
"$strip_tool" "$build_dir/src/stockfish.exe"
install -m 644 "$build_dir/src/stockfish.exe" "$output_path"
sha256sum "$output_path"
