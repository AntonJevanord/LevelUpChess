# Fairy Stockfish

Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish

Fairy Stockfish uses GPLv3; the upstream license is included in `COPYING.txt`. When redistributing an engine binary, comply with the GPL's corresponding-source requirements. Including the license alone does not establish compliance.

## Bundled Windows executable

- File: `fairy-stockfish-largeboard_x86-64.exe`
- Format: 64-bit Windows console executable.
- SHA-256: `2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99`
- Origin: supplied in the repository before the bridge was implemented.
- Exact upstream release, build flags, and matching source: **not yet established**.

The checksum identifies this file; it does not authenticate its upstream origin. Keep the original file unchanged until its release and source can be documented. Windows execution must be verified on the target computer. Do not describe the Linux integration test as verification of this binary.

## Cloud integration validation

The Node/UCI bridge was tested with a separate Linux build from upstream commit `9f778da667f6e07dae1e85d3e2ea204fc6dee94d`, using `make -j2 ARCH=x86-64 build` in the upstream `src` directory. This is a standard-board build without NNUE; it is not a replacement for the Windows large-board executable and is not committed here.

The bridge performs `uci` / `isready` handshakes, sets standard chess and bounded search settings, and validates returned moves with chess.js. Each request owns its engine process; pausing, undoing, resetting, or changing play settings cancels obsolete searches.
