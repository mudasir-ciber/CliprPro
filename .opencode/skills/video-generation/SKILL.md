---
name: video-generation
description: Operate CliprPro — local-first code-driven video pipeline. Validate inputs, run Phase 2 analysis (script/audio/transcript/alignment/timeline), render deterministic Canvas frames with Playwright, encode with FFmpeg, mux original voiceover. Use when the user asks to generate, analyze, render, validate, or debug a video from a script and voiceover.
---

# CliprPro Video Generation Skill (Phase 1 + Phase 2)

## Purpose

This repository is a **code-driven** video generator. The AI does NOT generate video pixels.
Pipeline:

```
script + voiceover
  → validate → audio analysis → transcription → alignment
  → pauses → narrative segmentation → importance → timeline.json
  → deterministic HTML/Canvas scene (renderAt(time))
  → Playwright PNG frames → FFmpeg H.264 + ORIGINAL voiceover
  → final.mp4
```

Audio duration is the **master clock**.

## Current scope

**Implemented (Phase 1 + 2):**
- Input validation, FFmpeg/FFprobe/Playwright checks
- Script parser + sentence IDs
- Audio metadata + silence/speech regions
- Transcription abstraction (`estimated` default; optional local `whisper`)
- Script↔transcript alignment, pause detection, heuristic narrative segments, importance scores
- `timeline.json` v2.0 + validation
- Analysis caching
- Deterministic basic Canvas scene (shows timeline narration text)
- Frame capture, encode, voiceover mux, FFprobe verification
- OpenCode commands for generate / analyze / render / validate / debug

**NOT implemented (do not claim or build now — Phase 3+):**
- AI storyboard / cinematic scene planning
- LLM visual prompt generation
- Three.js / WebGL scenes
- Visual QC / auto repair

`visualIntent.type = "placeholder"` is reserved for Phase 3.

## Prerequisites

```bash
npm install
npx playwright install chromium
npm run check-env
```

`check-env` must show OK for FFmpeg, FFprobe, and Chromium.

## Inputs

```
input/
├── script.txt        UTF-8. Prose or markdown headings. Full text is analyzed in Phase 2.
└── voiceover.mp3     mp3 | wav | m4a | aac  (duration = master timeline)
```

## Commands (invoke these; do not reinvent the pipeline)

```bash
npm run check-env
npm run analyze -- --input input [--debug] [--force] [--engine estimated]
npm run generate -- --input input [--fps 30] [--resolution 1920x1080] [--clean-frames] [--force]
npm run render -- --job jobs/<job-id>
npm run validate-timeline -- --file jobs/<job-id>/analysis/timeline.json
npm run debug -- --job jobs/<job-id>
npm run demo
npm test
```

### Recommended OpenCode orchestration

1. `npm run check-env` — stop on failure with the exact message.
2. Confirm `script.txt` + `voiceover.*` exist (or `--script` / `--audio` paths).
3. Prefer full run: `npm run generate -- --input input` (analyze + render).
4. Or staged: `analyze` → inspect `timeline.json` → `generate` / `render`.
5. On success: report Job ID, duration, FPS, resolution, `output/final.mp4`, and `analysis/timeline.json`.
6. On failure: print `ERROR (CODE)`, then summarize `jobs/<id>/logs/pipeline.log`. Do not infinite-retry.
7. For timing questions: `npm run debug -- --job jobs/<id>`.

## Job layout

```
jobs/job-YYYYMMDD-NNN/
├── input/           script + voiceover copies
├── audio/           analysis.json (compat)
├── analysis/
│   ├── script.json
│   ├── audio.json
│   ├── transcript.json
│   ├── alignment.json
│   ├── pauses.json
│   ├── narrative.json
│   ├── importance.json
│   └── timeline.json
├── scenes/          scene.html + scene.config.json
├── frames/          frame_000001.png …
├── output/          final.mp4
├── logs/            pipeline.log
└── metadata.json
```

## Deterministic rendering rules

Scenes must expose `window.renderAt(time)` and `window.__sceneReady = true`.
No `Date.now`, unseeded `Math.random`, or realtime animation for frame correctness.

## Transcription

- Default: `estimated` — maps script sentences onto speech regions by word weight (local, no model).
- Optional: `TRANSCRIPTION_ENGINE=whisper` after `npm install @xenova/transformers` (downloads model on first use).
- Timing provenance is stored per segment (`estimated` | `word` | `segment` | `interpolated`).

## Failure recovery

| Code / symptom | Action |
|----------------|--------|
| FFmpeg / FFprobe missing | Install FFmpeg, set PATH or `.env` paths, reopen terminal |
| Chromium missing | `npx playwright install chromium` |
| SCRIPT_/AUDIO_ errors | Fix input paths / formats |
| TIMELINE_INVALID | `npm run debug -- --job …` then `--force` re-analyze |
| TRANSCRIPTION_UNAVAILABLE | Use `--engine estimated` or install Whisper deps |

Rerun analysis only: `npm run analyze -- --input input --force`  
Rerun render from existing timeline: `npm run render -- --job jobs/<id>`

## Output reporting

Always report:
- Job ID
- `jobs/<id>/output/final.mp4`
- `jobs/<id>/analysis/timeline.json`
- timeline validation `valid: true/false`
- status from `metadata.json`
