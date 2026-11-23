# OpenCode Code-Driven Video Generator

**Phase 1 — Foundation.** A local-first pipeline that turns a **script + voiceover** into an MP4.

The AI does **not** generate video pixels. The system generates *executable visual code*; a browser runs it;
frames are captured; FFmpeg builds the video.

```
Script + Voiceover
  -> input validation -> audio analysis (FFprobe) -> job folder
  -> scene (HTML / Canvas 2D, window.renderAt(time))
  -> Playwright + Chromium: deterministic frame capture (PNG)
  -> FFmpeg: H.264 MP4 + ORIGINAL voiceover
  -> jobs/<job-id>/output/final.mp4
```

The voiceover duration is the **master timeline**. The original voiceover is preserved in the final MP4
(AAC is copied untouched; MP3/WAV are converted to AAC for MP4 compatibility).

## Requirements

| Tool | Notes |
|------|-------|
| Node.js 20+ | `node -v` |
| FFmpeg + FFprobe | on `PATH` (Windows: `winget install Gyan.FFmpeg`, then reopen the terminal) — or set `FFMPEG_PATH` / `FFPROBE_PATH` in `.env`. Needs the `libx264` encoder (standard builds have it) |
| Playwright + Chromium | installed by the steps below |
| OpenCode | optional; only needed to use the `/generate-video` command |

## Installation (Windows PowerShell / CMD, also works on macOS/Linux)

```bash
npm install
npx playwright install chromium
npm run check-env
```

`npm run check-env` must show `[ OK ]` for FFmpeg, FFprobe and Chromium.

## Run the demo

```bash
npm run demo
```

Creates a synthetic 12-second tone as a stand-in voiceover (a test signal, not speech), runs the whole
pipeline at 1920x1080 / 30 fps and writes `jobs/job-YYYYMMDD-001/output/final.mp4`.

## Run with your own files

```
input/
├── script.txt         line 1 = title, line 2 = subtitle (optional)
└── voiceover.mp3      mp3 | wav | m4a | aac
```

```bash
npm run generate -- --input input
# or explicit paths
npm run generate -- --script path\to\script.txt --audio path\to\voiceover.mp3
# options
npm run generate -- --input input --fps 30 --resolution 1280x720 --clean-frames
```

| Option | Default | Meaning |
|--------|---------|---------|
| `--script`, `--audio` | – | explicit file paths |
| `--input <folder>` | `input` | folder with `script.txt` + `voiceover.*` |
| `--fps <n>` | `30` | frames per second (1–120) |
| `--resolution <WxH>` | `1920x1080` | even width/height, e.g. `1280x720`, `3840x2160` |
| `--jobs-dir <folder>` | `jobs` | where job folders are created |
| `--clean-frames` | off | delete PNG frames after success |

Success prints:

```
VIDEO GENERATION COMPLETE

Job ID: job-20261122-001
Duration: 42.73 sec
FPS: 30
Resolution: 1920x1080

Output:
jobs\job-20261122-001\output\final.mp4
```

## Use with OpenCode

Open this folder in OpenCode. It picks up:

- `.opencode/skills/video-generation/SKILL.md` — teaches the agent the workflow and rules
- `.opencode/commands/generate-video.md` — the `/generate-video` command

Put `script.txt` and `voiceover.mp3` into `input/`, then run `/generate-video` (optionally with arguments such as `--fps 30`).

## Output structure

```
jobs/job-YYYYMMDD-NNN/
├── input/          copies of script + voiceover
├── audio/          analysis.json
├── scenes/         scene.html, scene.config.json
├── frames/         frame_000001.png ...
├── output/         final.mp4
├── logs/           pipeline.log
└── metadata.json   job id, times, script/audio paths, duration, FPS, resolution, status, output path
```

## Repository layout

```
.opencode/skills/video-generation/SKILL.md
.opencode/commands/generate-video.md
src/config.js            central configuration (+ minimal .env loader)
src/audio/               FFprobe metadata
src/pipeline/            checkDependencies, validateInputs, job, timeline, generateVideo, verifyOutput
src/scenes/              scene registry + basic scene (HTML template)
src/renderer/            Playwright frame renderer + FFmpeg encoder
src/utils/               logger, errors, process runner
scripts/                 generate-video.js, demo.js, check-env.js
tests/                   node:test suite
docs/ARCHITECTURE.md     design notes
```

## Tests

```bash
npm test
```

Covers: input validation, audio metadata, duration, frame count, scene generation, `renderAt(time)`
(availability + determinism), frame rendering, and the full pipeline producing a final MP4.
Tests needing FFmpeg/Chromium are **skipped** if those tools are missing — check that the summary says
`skipped 0`. To make missing tools a failure: `set REQUIRE_E2E=1` (Windows CMD) / `$env:REQUIRE_E2E=1` (PowerShell)
before `npm test`.

## Troubleshooting

| Message | Fix |
|---------|-----|
| `FFmpeg not found` / `FFprobe not found` | Install FFmpeg, add to `PATH`, reopen terminal, or set `FFMPEG_PATH` / `FFPROBE_PATH` in `.env` |
| `Playwright is not installed` | `npm install` |
| `Chromium for Playwright is not installed` | `npx playwright install chromium` |
| `Could not launch Chromium` (Linux/Docker, root) | set `CHROMIUM_NO_SANDBOX=1` in `.env` |
| `Unsupported audio format` | use mp3, wav, m4a or aac |
| `Invalid resolution` | width and height must be even numbers, e.g. `1920x1080` |
| Anything else | open `jobs/<job-id>/logs/pipeline.log` (full details and stack trace) |

## Phase 1 limitations

- One built-in scene; the script only supplies the title (line 1) and subtitle (line 2).
- No script analysis, storyboard, scene planning, or speech timing yet.
- Canvas 2D only (no SVG/GSAP/Three.js/WebGL yet).
- Frames are captured with `page.screenshot` — correct but not fast. Measured in a Linux sandbox:
  about 0.22 s per 1080p frame (a 12 s video took ~80 s to render). Long videos will be slow until Phase 9.
- PNG frames are kept by default for inspection (1080p ≈ 100–300 KB each). Use `--clean-frames` for long videos.
- Fonts come from the machine (Segoe UI on Windows). Output is deterministic on one machine; text may look slightly different on another.
- No quality control, no automatic repair, no retries.
- Tested on Linux only so far; Windows testing is the next step (see Antigravity checklist).

## Roadmap

1. Foundation (this phase) · 2. Audio + timeline engine · 3. AI storyboard + scene planner · 4. 2D visual generation ·
5. 3D (Three.js/WebGL) · 6. Cinematic system · 7. Visual QC · 8. Self-correction · 9. Long-form + reliability · 10. Production release
