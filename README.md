# Block Trainer

Local practice app for falling-block puzzle play. Focus: finesse (minimal inputs per placement) and speed, with the same handling values you use in your main game.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # strict typecheck + production build
```

## Keys

Rebind any action in the **Controls** panel: click a slot, press a key (Esc cancels, Backspace clears). Each action has two slots; a key bound elsewhere is moved. Bindings persist in localStorage.

Defaults:

| Action | Key |
| --- | --- |
| Move | ArrowLeft / ArrowRight |
| Soft drop | ArrowDown |
| Hard drop | Space |
| Rotate CCW / CW / 180 | Z / X or ArrowUp / A |
| Hold | C or Left Shift |
| Restart | R |

## Handling

| Setting | Meaning |
| --- | --- |
| DAS | Time a direction must be held before auto-shift starts |
| ARR | Time between auto-shift steps (0 = instant to wall) |
| DCD | Delay before DAS re-engages after rotating or placing |
| SDF | Soft drop speed factor (41 = instant to floor, no lock) |

Settings persist in localStorage. Values are in milliseconds (1 frame = 16.7 ms).

## Features

- Rotation with SRS+ semantics, including 180 kicks (`src/engine/kicks.ts`)
- Seeded 7-bag, hold, 5-piece preview, T-spin detection
- Finesse feedback per piece: `OK` or `fault: used N, optimal M: <sequence>`
- Stats: pieces, time, PPS, KPP, finesse %
- Session history (last 50) and replays (last 10) in localStorage, with export/import as JSON
- **Replay viewer**: pause, step piece by piece (←/→), jump between issues (Shift+←/→), click the timeline to seek, 0.25x-4x speed. The timeline marks every finesse fault (red) and new hole (orange); the last placed piece is described under it. Seeking backwards re-simulates from the start, which is exact because the engine is deterministic (`src/replay/timeline.ts`).

## Training modes

- **Calibrate**: plays your current handling plus up to four candidate profiles, 1-3 times each (default 2), blind (configs are letters until the end). Each round uses its own piece sequence, shared by every config in that round, and a fresh shuffled order. Ranks by average score = PPS x finesse rate and shows each config's score range; if the winner's worst attempt does not beat the runner-up's best, it tells you the gap is within your own variance. Every attempt keeps its replay.
- **Upgrade**: a ladder from relaxed (DAS 167 / ARR 33) to competitive (DAS 83 / ARR 0 / DCD 0). Starts at the level closest to your handling. Pass a level with finesse >= 90% and PPS >= 95% of your best on the previous level; apply the fastest passed level to your settings.

- **Sprint 40L**: stacking drill for 40-line sprints. Pick a distribution (9-1 right/left well, 6-3, 3-6, 7-2, 2-7); the well column is tinted on the board. Every piece is checked for well violations (anything but a vertical I in the well) and new holes, highlighted in red. A **placement guide** draws planned ghosts (numbered in order, `H` = hold first, `*` = soft drop then tuck or spin). Guide modes: *Opener* (first 6 pieces), *Full plan* (every visible piece, all run), *Next piece only*, *After mistakes* (hidden until you make a hole or block the well, then shows the best spot for the next piece) and *Off*. Tracks time, PPS, finesse, tetris rate, best time per layout (with replay) and recent runs. R restarts with new pieces.
- **Planner** (`src/modes/sprint/planner.ts`): hold-aware beam search on the real board over the active piece plus the 5 previews. It generates hard drops plus, when the board has overhangs, up to two slides/rotations after a soft drop (tucks and spins), simulates line clears, rewards tetrises and penalizes holes, a filled well, bumpiness, narrow pits and height. It runs in a Web Worker (`planner.worker.ts`), so a search (~50 ms) never stalls input or rendering.

- **Weak spots**: every evaluated placement in any live mode is filed by pattern: piece, orientation (rotations with the same shape are merged, e.g. S/Z/I flat or vertical) and leftmost column. Only the last 20 tries of each pattern count, so once you fix a habit it drops off the list. The tab ranks patterns by smoothed recent fault rate and shows the empty-board optimal inputs. **Drill** deals your 5 weakest patterns in shuffled rounds (20 or 40 pieces), one at a time on an empty board with hold disabled and a target ghost; a rep is clean only when the piece lands on the target with optimal inputs. Drill replays are deterministic (the forced queue is stored in the replay). Logic in `src/modes/weakspots/`.

Calibrate/Upgrade trials end after 20/40/60 pieces. R retries the current trial. Logic lives in `src/modes/training/`.

## Roadmap

- Opener drills with forced queue
- Handling lab (A/B compare DAS/ARR)
