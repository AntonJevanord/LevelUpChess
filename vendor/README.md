# Fairy Stockfish browser rules

`ffish-es6` 0.7.10 is distributed under GPLv3. Its WebAssembly rules engine is embedded in the generated browser and Node bundles. The GPL is included in `dist/ffish-LICENSE.txt` and `stockfish/COPYING.txt`.

The matching upstream source is included in `ffish-es6-0.7.10-source.tar.gz`:

- Package: https://www.npmjs.com/package/ffish-es6/v/0.7.10
- npm published `gitHead`: `43b66c8abfebfcab893a3a4c349aa790d18df148`
- Source: https://github.com/fairy-stockfish/Fairy-Stockfish/tree/43b66c8abfebfcab893a3a4c349aa790d18df148
- Archive SHA-256: `52b080d823fd4785a598e4201ab26be2752bdbc093b8c9a9a47b99de13a65a86`

The archive was made with `git archive` from that upstream commit. The build scripts are in `src/Makefile_js`; the ES6 target uses `make -f Makefile_js build es6=yes` with Emscripten. This records the source of the published package; byte-for-byte rebuild reproducibility has not been tested.

Repository-side adapter and setup changes are in `src/variant-game.js` and `variants/levelup-knight.ini`. The Windows executable is a separate artifact with its own provenance notes in `stockfish/README.md`.
