# Architecture (Phases 1–10 — production)

## Data flow

```
scripts/generate-video.js
        │
        ▼
analyze → storyboard → render (chunked/parallel)
        → QC → self-repair (bounded)
        → encode + mux original voiceover
        → Phase 10 delivery package
        → jobs/<id>/output/final.mp4
        → jobs/<id>/delivery/  (handoff)
```

## Contracts

- Audio is the master clock.
- Deterministic `window.renderAt(time)`.
- Phase 7 `qc.json` · Phase 8 `repair.json` · Phase 9 `render.json`.
- Phase 10 `delivery.json`: titles, description, chapters, disclosure, media + QC summary.
- Flat `delivery/` folder copies `final.mp4`, thumbnail, text sidecars for upload/handoff.

## Modules

| Concern | Path |
|---------|------|
| Analysis | `src/analysis/` |
| Timeline | `src/timeline/` |
| Storyboard | `src/storyboard/` |
| Visuals / camera | `src/visuals2d/`, `src/cinematic/` |
| QC / repair | `src/qc/`, `src/repair/` |
| Render | `src/renderer/` |
| Production packaging | `src/package/` |
| Scenes | `src/scenes/*` |

## Production commands

| Script | Purpose |
|--------|---------|
| `npm run doctor` | Deps + phase readiness |
| `npm run generate` | Full pipeline + packaging |
| `npm run package` | Re-package completed job |
| `npm test` | Regression suite |

## Phase boundary

Roadmap phases 1–10 are complete. Further work is product iteration, not gated phases.
