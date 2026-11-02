# Nightrider hopper diagnostic

The requested `N0gN0` cannot serve as a movement buff with the project's
bundled native engine and browser rules. In this build, the parsed `gN0`
component contributes to automatic evaluation values but adds no runtime moves
or attacks. `gN0` by itself has no moves for the custom piece.

On the ray `b1–c3–d5–e7`, a friendly or enemy hurdle on c3 still blocks travel
to d5/e7. The requested piece behaves like `N0` in the tested positions. It
does not gain a checking attack through the hurdle either.

## Source explanation

The matching source archive is
`vendor/ffish-es6-0.7.10-source.tar.gz`, upstream commit
`43b66c8abfebfcab893a3a4c349aa790d18df148`.

`src/piece.cpp` parses hopper components, including the knight vector.
However, `src/bitboard.cpp`, in `Bitboards::init_pieces()` around lines 238–277,
selects a normal nightrider runtime type from `HorseDirections` only for
sliders. Its hopper loop selects runtime types only for orthogonal and
diagonal directions. It has no nightrider-hopper runtime type. Changing the
Betza spelling to `gN` or `pN0` does not supply that missing generator.

This is a limitation of this engine revision, not a general statement about
Betza or all Fairy-Stockfish versions. Supporting the exact idea requires
matching native and browser movement-generator changes before any scored run.

## Evaluation diagnostic

These are internal engine values, not fitted material values or upgrade costs.

| Definition | Automatic raw MG / EG | Capture/evaluation MG / EG |
| --- | ---: | ---: |
| `N0` | 2326 / 2211 | 2326 / 2211 |
| `N0gN0` | 4776 / 3979 | 4776 / 3979 |
| `gN0` | 1716 / 1252 | 1716 / 1252 |
| `N0cF` | 2680 / 2560 | 2680 / 2566 |
| `N0cW` | 2680 / 2560 | 2680 / 2566 |
| `N0cC` | 3050 / 2925 | 3050 / 2925 |

Running automatic-value `N0` versus `N0gN0` would therefore change the engine's
valuation without delivering the intended extra moves. Fixing both at the
original **2326/2211** verifies consistent tables but still leaves the same
movement. That comparison is not a valid buff experiment.

## Supported alternatives for discussion

- `N0cF`: nightrider plus four adjacent diagonal captures.
- `N0cW`: nightrider plus four adjacent orthogonal captures.
- `N0cC`: nightrider plus camel captures; a broader tactical change.

All retain the original quiet movement. The selected [focused comparison](../../docs/nightrider-focus-v17.md)
tests `N0cF` and `N0cW` against a fresh `N0` control. Their research IDs live only
in that study's isolated runtime; the current playable catalog stays unchanged.
All three receive the original N0 prior in every engine table, for both colors.

## Reproduce

```powershell
node prototypes/nightrider-hop/verify.cjs
```

The test compares all 64 origins, both colors and every single friendly/enemy
hurdle in browser rules: **15,744 fixtures**. It also covers repeated-ray
hurdles, checking attacks, royal pins and the exact capture-only alternatives.
If a native executable is available, the default checks a representative
492-position blocker subset and the targeted fixtures across diagnostic
profiles. Set `FAIRY_STOCKFISH_PATH` for another compatible executable.

For native parity across the full blocker matrix:

```powershell
node prototypes/nightrider-hop/verify.cjs --full-native
```

These commands perform only rule/perft and read-only value diagnostics. They
start no searches or scored games, rebuild no checked-in bundle, and leave
the accepted N0 definition and current campaigns unchanged.
