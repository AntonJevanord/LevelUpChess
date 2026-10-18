# Fairy Stockfish

Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish

Fairy Stockfish uses GPLv3; the upstream license is included in `COPYING.txt`. When redistributing an engine binary, comply with the GPL's corresponding-source requirements. Including the license alone does not establish compliance.

## Bundled Windows executable

- File: `fairy-stockfish-largeboard_x86-64.exe`
- Format: 64-bit Windows console executable.
- SHA-256: `2fe12ff0fcad0295482cab7660e1fcc24259cebc4ef164839fb16c9f9cabfc99`
- Origin: supplied in the repository before the bridge was implemented.
- Exact upstream release, build flags, and matching source: **not yet established**.

The checksum identifies this file; it does not authenticate its upstream origin. The original file is unchanged. The user has tested earlier game versions with it on Windows, but version 05 compatibility has not been established. Cloud Linux tests do not verify this binary.

## Version 05 compatibility

Version 05 needs modern custom-piece, castling, initial-region, promotion, and en passant support. An engine can advertise the variant while ignoring fields it does not understand, so the bridge checks relevant legal moves before searching. Failed checks report the missing ability and preserve the game for local play.

If the bundled executable fails a check, use a current official master build from [upstream Actions](https://github.com/fairy-stockfish/Fairy-Stockfish/actions), or build current upstream source. Choose a Windows executable compatible with your CPU. The older Fairy-Stockfish 14 release does not provide all version 05 rules. Official build artifacts may require a GitHub login and can expire; no replacement Windows binary is included or claimed as tested here.

Set the path before starting the server, for example in PowerShell:

```powershell
$env:FAIRY_STOCKFISH_PATH = 'C:\engines\fairy-stockfish.exe'
npm.cmd start
```

The browser's embedded rules work offline regardless of native engine availability. See [variant rules](../variants/README.md) for the active and preserved profiles.

## Cloud integration validation

Earlier bridge integration used a Linux source build at upstream commit `9f778da667f6e07dae1e85d3e2ea204fc6dee94d`. Version 05 development uses a Linux build from `43b66c8abfebfcab893a3a4c349aa790d18df148`, the same source revision as the embedded `ffish-es6` 0.7.10 rules. Its source archive and provenance are in [vendor/README.md](../vendor/README.md). Native builds use `make -j2 ARCH=x86-64 build` in the source `src` directory.

These Linux executables are development artifacts, not replacements for the bundled Windows executable, and are not committed here. Windows playtesting remains necessary.

The bridge performs `uci` / `isready` handshakes, loads the selected variant, checks required abilities, and applies bounded search settings. Returned moves are validated with chess.js for standard chess or the embedded rules for upgrades. Each request owns its engine process; pausing, undoing, resetting, or changing play settings cancels obsolete searches.
