---
name: video-generation
description: Operate CliprPro — local-first code-driven video pipeline. Analyze script+voiceover into a timeline, plan a Phase 3 storyboard (visualIntent), render deterministic Canvas frames with Playwright, encode with FFmpeg, mux original voiceover. Use when the user asks to generate, analyze, storyboard, render, validate, or debug a video.
---

# CliprPro Video Generation Skill (Phases 1–3)

## Purpose

Code-driven video generator. The AI does NOT paint pixels.
Pipeline:

```
script + voiceover
  → Phase 2 analysis → timeline.json
  → Phase 3 storyboard → storyboard.json (visualIntent per scene)
  → HTML/Canvas scene (renderAt(time))
  → Playwright PNGs → FFmpeg H.264 + ORIGINAL voiceover
  → final.mp4
```

Audio duration is the **master clock**.

## Current scope

**Implemented:**
- Phase 1: deterministic render/encode/mux
- Phase 2: script/audio/transcript/alignment/pauses/narrative/importance/timeline
- Phase 3: storyboard planner (`heuristic` default, optional `llm`), `storyboard` Canvas scene (mood/layout/motion/palette), OpenCode commands

**NOT implemented yet (Phase 4+):**
- Advanced multi-module 2D generators
- Three.js / WebGL
- Visual QC / auto-repair
- Long-form performance overhaul

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
npm run validate-timeline -- --file jobs/<id>/analysis/timeline.json
npm run debug -- --job jobs/<id>
npm run demo
npm test
```

### Recommended OpenCode orchestration

1. `npm run check-env`
2. Confirm script + voiceover inputs
3. Prefer: `npm run generate -- --input input` (analyze + storyboard + render)
4. Or staged: `analyze` → `storyboard` → `render`
5. Report Job ID, `output/final.mp4`, `analysis/timeline.json`, `analysis/storyboard.json`
6. On failure: `ERROR (CODE)` + summarize `logs/pipeline.log` once

## Storyboard planners

| Planner | When |
|---------|------|
| `heuristic` | Default, offline, deterministic |
| `llm` | Needs `STORYBOARD_API_KEY` or `OPENAI_API_KEY` |
| `auto` | Try LLM, fall back to heuristic |

OpenCode may also author a storyboard JSON and apply with `--storyboard path.json`.

## Job layout

```
jobs/job-…/
├── analysis/
│   ├── timeline.json
│   ├── storyboard.json    # Phase 3
│   └── …
├── scenes/scene.html
├── output/final.mp4
└── metadata.json
```

## Determinism

Scenes expose `window.renderAt(time)` + `__sceneReady`.
No `Date.now` / unseeded `Math.random` / realtime animation for frame correctness.

## Failure recovery

| Issue | Action |
|-------|--------|
| Missing FFmpeg/Chrome | Install / PATH / `CHROMIUM_PATH` |
| STORYBOARD_UNAVAILABLE | Use `--planner heuristic` |
| Bad timeline | `debug` then `analyze --recompute` |
| Re-render only | `npm run render -- --job …` |
