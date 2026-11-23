# Architecture (Phases 1–4)

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
src/pipeline/generateVideo.js         (Phase 1 render)
  → scenes/storyboard (or basic)
  → Playwright renderAt(t) → PNG
  → FFmpeg encode + original voiceover
  → verifyOutput
```

## Contracts

- Audio is the master clock.
- `timeline.json` v2.0 bridges analysis and visuals.
- Phase 3 `visualIntent.type = "storyboard"` (mood, layout, motion, palette, visualPrompt, camera).
- `window.renderAt(time)` is a pure function of time.

## Modules

| Concern | Path |
|---------|------|
| Analysis | `src/analysis/` |
| Timeline | `src/timeline/` |
| Storyboard | `src/storyboard/` |
| Advanced 2D presets | `src/visuals2d/` |
| Scenes | `src/scenes/basic`, `src/scenes/storyboard` |
| Render / encode | `src/renderer/` |

## OpenCode

Skills/commands under `.opencode/` orchestrate via `npm run …`.
OpenCode can plan shots (or supply JSON); the renderer executes them.

## Phase boundary

Phase 5+ (Three.js/WebGL, cinematic camera systems, QC, auto-repair) is out of scope until requested.
