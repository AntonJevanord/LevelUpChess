#!/usr/bin/env bash
# Cross-build the bundled Windows engine from the matching, vendored GPL source.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_archive="$repo_root/vendor/ffish-es6-0.7.10-source.tar.gz"
archive_sha256=52b080d823fd4785a598e4201ab26be2752bdbc093b8c9a9a47b99de13a65a86
output_path="${1:-$repo_root/stockfish/fairy-stockfish-levelup_x86-64.exe}"
compiler="${MINGW_CXX:-x86_64-w64-mingw32-g++}"
strip_tool="${MINGW_STRIP:-x86_64-w64-mingw32-strip}"

if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [output.exe]\n' "$0" >&2
  exit 2
fi
command -v "$compiler" >/dev/null
command -v "$strip_tool" >/dev/null
printf '%s  %s\n' "$archive_sha256" "$source_archive" | sha256sum --check --status

build_dir="$(mktemp -d "${TMPDIR:-/tmp}/levelup-windows.XXXXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT
tar -xzf "$source_archive" --strip-components=1 -C "$build_dir"

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
