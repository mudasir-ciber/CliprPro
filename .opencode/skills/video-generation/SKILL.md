---
name: video-generation
description: Turn a script and a voiceover into an MP4 using the code-driven pipeline in this repository (validate, analyse audio, render a deterministic Canvas scene with Playwright, encode with FFmpeg). Use when the user asks to generate, render or test a video from a script and voiceover.
---

# Video Generation Skill

## Purpose

This repository is a **code-driven** video generator. The AI does NOT generate video pixels.
Instead: script + voiceover -> executable visual code (HTML/Canvas) -> Chromium executes it ->
frames are captured -> FFmpeg encodes them and merges the ORIGINAL voiceover -> `final.mp4`.

## Current scope: PHASE 1 (foundation only)

Working in Phase 1:
- Input validation (script + voiceover) and FFmpeg/FFprobe/Playwright/Chromium checks
- Audio analysis with FFprobe (duration, format, sample rate, channels)
- Job folders with `metadata.json` and logs
- ONE built-in scene (`basic`): dark background, title/subtitle from the first two script lines,
  an animated geometric object, progress bar, timecode. Timing adapts to the audio duration.
- Deterministic rendering through `window.renderAt(time)`
- PNG frame capture (Playwright, one browser per job), H.264 MP4 encoding, original voiceover merge

NOT in Phase 1 (do not implement or pretend): storyboard/scene planning from the script, NLP,
Three.js/WebGL, GSAP, quality control, self-repair, long-form optimisation, AI voice, dashboards.
The script text is only used for the title and subtitle today.

## How to run

Always use the project command, never re-implement the pipeline by hand:

```bash
npm run check-env                      # verify Node, FFmpeg, FFprobe, Chromium
npm run generate -- --script input/script.txt --audio input/voiceover.mp3
npm run generate -- --input input      # folder containing script.txt + voiceover.mp3|wav|m4a|aac
npm run generate -- --input input --fps 30 --resolution 1920x1080
npm run demo                           # synthetic 12 s demo
npm test
```

Options: `--fps <n>` (default 30), `--resolution <WxH>` (default 1920x1080, even numbers only),
`--jobs-dir <folder>`, `--clean-frames`.

## Input format

```
input/
├── script.txt        UTF-8 text. Line 1 = title, line 2 = subtitle (optional).
└── voiceover.mp3     mp3, wav, m4a or aac. The audio duration is the MASTER duration.
```

## Output structure

```
jobs/job-YYYYMMDD-NNN/
├── input/       copies of the script and voiceover
├── audio/       analysis.json (FFprobe result)
├── scenes/      scene.html + scene.config.json (the generated visual code)
├── frames/      frame_000001.png ...
├── output/      final.mp4
├── logs/        pipeline.log (full details and stack traces)
└── metadata.json  status: created | rendering | encoding | merging | completed | failed
```

## Deterministic rendering rules (important when editing or adding scenes)

A scene is an HTML file that:
1. exposes `window.renderAt(time)` (seconds) and draws EXACTLY the state for that time,
2. sets `window.__sceneReady = true` when ready,
3. never uses `Date.now`, `Math.random`, `requestAnimationFrame`, `performance.now`, `setTimeout`
   or `setInterval` (use a seeded PRNG for randomness),
4. renders at any time in any order and gives identical pixels.

Frame `i` (0-based) is rendered at `t = i / fps`; total frames = `ceil(duration * fps)`;
files are named `frame_%06d.png` starting at 1.

## Error handling

The CLI prints a clean `ERROR (CODE): message`. Full details and stack traces are in
`jobs/<job-id>/logs/pipeline.log`. Common codes: `FFMPEG_MISSING`, `FFPROBE_MISSING`,
`PLAYWRIGHT_MISSING`, `CHROMIUM_MISSING`, `SCRIPT_MISSING`, `AUDIO_MISSING`,
`AUDIO_UNSUPPORTED_FORMAT`, `INVALID_DURATION`, `SCENE_RENDER_FAILED`, `FRAME_CAPTURE_FAILED`,
`ENCODE_FAILED`, `AUDIO_MERGE_FAILED`. On failure: read the log, report the code and cause,
fix only what is needed. Do not add retry loops (self-repair is Phase 8).

## Constraints

- Windows first: no shell-specific syntax inside the Node code; paths via `node:path`.
- Local-first: no paid APIs, no cloud, no database, no frontend.
- Do not rewrite working modules without a reason; extend them.
- Do not claim a video was generated unless the command finished and `final.mp4` exists.
- Never commit `.env`, `jobs/`, `input/` media.

## Where things live

`src/config.js` config | `src/audio/` FFprobe | `src/pipeline/` validation, job, timeline,
orchestrator | `src/scenes/` scene generators | `src/renderer/` Playwright + FFmpeg | `scripts/` CLI | `tests/`
