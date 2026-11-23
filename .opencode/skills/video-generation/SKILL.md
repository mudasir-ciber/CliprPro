---
name: video-generation
description: Operate CliprPro — local-first code-driven video pipeline. Analyze script+voiceover into a timeline, plan a storyboard with Phase 4–6 visual intents, render Canvas/Three.js frames, run Phase 7 visual QC, Phase 8 self-repair on failure, encode with FFmpeg, mux original voiceover. Use when the user asks to generate, analyze, storyboard, render, qc, validate, or debug a video.
---

# CliprPro Video Generation Skill (Phases 1–8)

## Purpose

Code-driven video generator. The AI does NOT paint pixels.
Pipeline:

```
script + voiceover
  → Phase 2 analysis → timeline.json
  → Phase 3 storyboard → storyboard.json (visualIntent per scene)
  → HTML/Canvas or Three.js scene (renderAt(time))
  → Playwright PNGs
  → Phase 7 visual QC → qc.json
  → Phase 8 self-repair (bounded) → patch → re-render → QC
  → FFmpeg H.264 + ORIGINAL voiceover
  → final.mp4
```

Audio duration is the **master clock**.

## Current scope

**Implemented:**
- Phase 1: deterministic render/encode/mux
- Phase 2: script/audio/transcript/alignment/pauses/narrative/importance/timeline
- Phase 3: storyboard planner (`heuristic` default, optional `llm`)
- Phase 4: advanced 2D motifs/transitions/typography/fx on the `storyboard` Canvas scene
- Phase 5: deterministic Three.js/WebGL scene via `--scene threejs`
- Phase 6: cinematic camera moves (`dolly-in/out`, `orbit-*`, `crane-*`, `handheld`, `push-slide`, `whip-pan`) on storyboard + threejs
- Phase 7: visual QC on rendered frames (integrity, black/freeze, shot coverage, contact sheet)
- Phase 8: bounded self-repair (QC → storyboard patch / re-render → QC)
- OpenCode commands for generate / analyze / storyboard / render / qc / validate / debug

**NOT implemented yet (Phase 9+):**
- Long-form performance overhaul
- Production packaging / dashboards

## Prerequisites

```bash
npm install
npx playwright install chromium   # or use installed Google Chrome
npm run check-env
```

## Commands

```bash
npm run check-env
npm run analyze -- --input input
npm run storyboard -- --job jobs/<id> [--planner heuristic|llm|auto]
npm run generate -- --input input [--planner heuristic] [--scene storyboard]
npm run render -- --job jobs/<id>
npm run qc -- --job jobs/<id> [--qc-strict]
npm run validate-timeline -- --file jobs/<id>/analysis/timeline.json
npm run debug -- --job jobs/<id>
npm run demo
npm test
```

### Recommended OpenCode orchestration

1. `npm run check-env`
2. Confirm script + voiceover inputs
3. Prefer: `npm run generate -- --input input` (analyze + storyboard + render + QC + repair)
4. Or staged: `analyze` → `storyboard` → `render` → `qc` (if frames kept)
5. Report Job ID, `output/final.mp4`, `analysis/timeline.json`, `analysis/storyboard.json`, `analysis/qc.json`, `analysis/repair.json` if present
6. On failure: `ERROR (CODE)` + summarize `logs/pipeline.log` once

## Storyboard planners

| Planner | When |
|---------|------|
| `heuristic` | Default, offline, deterministic |
| `llm` | Needs `STORYBOARD_API_KEY` or `OPENAI_API_KEY` |
| `auto` | Try LLM, fall back to heuristic |

OpenCode may also author a storyboard JSON and apply with `--storyboard path.json`.
Camera fields live on `shots[].visualIntent.camera`.

## Visual QC + self-repair

QC runs after frame render unless `--skip-qc`.
On hard QC failure, Phase 8 plans repairs (brighten, motif/motion/camera, or plain re-render) up to `--repair-attempts` (default 2).
Artifacts: `analysis/qc.json`, `qc-attempt-N.json`, `repair.json`.
`--skip-repair` disables the loop (immediate `QC_FAILED`).
Exhausted retries → `REPAIR_FAILED`.

## Job layout

```
jobs/job-…/
├── analysis/
│   ├── timeline.json
│   ├── storyboard.json
│   ├── qc.json
│   ├── repair.json
│   └── …
├── scenes/scene.html
├── frames/
├── output/final.mp4
└── metadata.json
```

## Determinism

Scenes expose `window.renderAt(time)` + `__sceneReady`.
No `Date.now` / unseeded `Math.random` / realtime animation for frame correctness.
Repair patches are deterministic functions of QC issue codes + attempt index.

## Failure recovery

| Issue | Action |
|-------|--------|
| Missing FFmpeg/Chrome | Install / PATH / `CHROMIUM_PATH` |
| STORYBOARD_UNAVAILABLE | Use `--planner heuristic` |
| QC_FAILED / REPAIR_FAILED | Read `qc.json` + `repair.json`; adjust storyboard or `--repair-attempts` |
| Bad timeline | `debug` then `analyze --recompute` |
| Re-render only | `npm run render -- --job …` |
