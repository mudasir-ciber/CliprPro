# Architecture (Phases 1–9)

## Data flow

```
scripts/generate-video.js
        │
        ▼
src/pipeline/analyzeVideo.js          (Phase 2)
  → timeline.json
        │
        ▼
src/pipeline/planStoryboard.js        (Phase 3)
  → storyboard.json + visualIntent
        │
        ▼
src/pipeline/generateVideo.js
  → scenes/storyboard | threejs | basic
  → Phase 9 chunked/parallel Playwright renderAt(t) → PNG
  → Phase 7 visual QC → analysis/qc.json
  → Phase 8 self-repair (bounded) → patch → re-render → QC
  → FFmpeg encode + original voiceover
  → verifyOutput
```

## Contracts

- Audio is the master clock.
- `timeline.json` v2.0 bridges analysis and visuals.
- Phase 3–6 `visualIntent` + Phase 6 cinematic `camera`.
- Phase 7 `qc.json`; Phase 8 `repair.json`.
- Phase 9: frames rendered in chunks across N workers; `analysis/render.json` + `render-progress.json` support resume.
- `window.renderAt(time)` is a pure function of time (safe to parallelize).

## Modules

| Concern | Path |
|---------|------|
| Analysis | `src/analysis/` |
| Timeline | `src/timeline/` |
| Storyboard | `src/storyboard/` |
| Advanced 2D | `src/visuals2d/` |
| Cinematic camera | `src/cinematic/` |
| Visual QC | `src/qc/` |
| Self-repair | `src/repair/` |
| Render (incl. long-form) | `src/renderer/` |
| Scenes | `src/scenes/basic`, `storyboard`, `threejs` |

## Long-form rendering

- `planChunks(total, chunkSize)` splits the frame range.
- `resolveWorkerCount` auto-bumps workers when `totalFrames >= longFormMinFrames` (default 120).
- Workers = parallel Playwright pages in one browser (shared HTTP static server for Three.js).
- `--no-resume` forces full rewrite; otherwise existing PNGs are skipped.

## OpenCode

Skills/commands under `.opencode/` orchestrate via `npm run …`.

## Phase boundary

Phase 10 (production packaging / release polish) is out of scope until requested.
