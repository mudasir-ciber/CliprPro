# Architecture (Phases 1–8)

## Data flow

```
scripts/generate-video.js
        │
        ▼
src/pipeline/analyzeVideo.js          (Phase 2)
  → script / audio / transcript / alignment / pauses / narrative / importance
  → timeline.json
        │
        ▼
src/pipeline/planStoryboard.js        (Phase 3)
  → heuristic | llm | auto planner
  → storyboard.json
  → timeline.scenes[].visualIntent = storyboard shot
        │
        ▼
src/pipeline/generateVideo.js
  → scenes/storyboard | threejs | basic
  → Playwright renderAt(t) → PNG
  → Phase 7 visual QC → analysis/qc.json (+ contact sheet)
  → Phase 8 self-repair (bounded) → patch storyboard → re-render → QC
  → FFmpeg encode + original voiceover
  → verifyOutput
```

## Contracts

- Audio is the master clock.
- `timeline.json` v2.0 bridges analysis and visuals.
- Phase 3–6 `visualIntent.type = "storyboard"` (mood, layout, motion, motif, transition, typography, fx, palette, visualPrompt, camera).
- Phase 6 `camera`: `{ move, ease, intensity, zoom, panX, panY, roll, fov, from?, to? }` evaluated in scene templates via shot-local progress.
- Phase 7 `qc.json`: sampled frame stats + issues (`error` | `warning`); hard errors block encode unless repaired.
- Phase 8 `repair.json`: attempt log; strategies map QC codes → storyboard patches + re-render.
- `window.renderAt(time)` is a pure function of time.

## Modules

| Concern | Path |
|---------|------|
| Analysis | `src/analysis/` |
| Timeline | `src/timeline/` |
| Storyboard | `src/storyboard/` |
| Advanced 2D presets | `src/visuals2d/` |
| Cinematic camera | `src/cinematic/` |
| Visual QC | `src/qc/` |
| Self-repair | `src/repair/` |
| Scenes | `src/scenes/basic`, `storyboard`, `threejs` |
| Render / encode | `src/renderer/` |

## OpenCode

Skills/commands under `.opencode/` orchestrate via `npm run …`.
OpenCode can plan shots (or supply JSON); the renderer executes them; QC gates bad frames; repair retries are bounded and logged.

## Phase boundary

Phase 9+ (long-form performance, production packaging) is out of scope until requested.
