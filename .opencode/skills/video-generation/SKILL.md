---
name: video-generation
description: Operate CliprPro — local-first code-driven video pipeline. Analyze script+voiceover, plan storyboard, chunked/parallel Playwright render, visual QC, self-repair, FFmpeg encode + original voiceover. Use when the user asks to generate, analyze, storyboard, render, qc, validate, or debug a video.
---

# CliprPro Video Generation Skill (Phases 1–9)

## Purpose

Code-driven video generator. The AI does NOT paint pixels.
Pipeline:

```
script + voiceover
  → Phase 2 analysis → timeline.json
  → Phase 3 storyboard → storyboard.json
  → HTML/Canvas or Three.js (renderAt(time))
  → Phase 9 chunked/parallel Playwright PNGs
  → Phase 7 visual QC → qc.json
  → Phase 8 self-repair (bounded) → patch → re-render → QC
  → FFmpeg H.264 + ORIGINAL voiceover
  → final.mp4
```

Audio duration is the **master clock**.

## Current scope

**Implemented:**
- Phases 1–8 (foundation through self-repair)
- Phase 9: long-form chunked/parallel frame render + resume checkpoints
- OpenCode commands for generate / analyze / storyboard / render / qc / validate / debug

**NOT implemented yet (Phase 10):**
- Production packaging / dashboards / release polish

## Commands

```bash
npm run check-env
npm run analyze -- --input input
npm run storyboard -- --job jobs/<id>
npm run generate -- --input input [--workers 2] [--chunk-size 90]
npm run render -- --job jobs/<id> [--no-resume]
npm run qc -- --job jobs/<id>
npm run demo
npm test
```

### Recommended OpenCode orchestration

1. `npm run check-env`
2. Confirm script + voiceover
3. `npm run generate -- --input input`
4. Report Job ID, `final.mp4`, `timeline.json`, `storyboard.json`, `qc.json`, `render.json`, `repair.json` if present
5. On failure: `ERROR (CODE)` + `logs/pipeline.log` once

## Long-form tips

- Auto: ≥120 frames → 2 workers
- Manual: `--workers 4 --chunk-size 60`
- Resume skips existing PNGs; `--no-resume` forces rewrite
- Interrupted jobs: re-run `render` / `generate` with frames kept (no `--clean-frames` mid-run)

## Failure recovery

| Issue | Action |
|-------|--------|
| Missing FFmpeg/Chrome | Install / PATH / `CHROMIUM_PATH` |
| QC_FAILED / REPAIR_FAILED | Read `qc.json` + `repair.json` |
| Partial frames | Re-run render (resume fills gaps) |
| Re-render only | `npm run render -- --job …` |
