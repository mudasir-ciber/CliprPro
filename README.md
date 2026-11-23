# CliprPro

**Local-first, code-driven AI video generation** (OpenCode-ready).

Not a neural text-to-video model. The system analyzes a **script + voiceover** into a validated **timeline**, renders deterministic HTML/Canvas scenes with Playwright, and muxes the **original voiceover** with FFmpeg into `final.mp4`.

```
Script + Voiceover
  → Phase 2 analysis (sentences, silence, transcript, alignment, pauses, narrative, importance)
  → timeline.json (audio = master clock)
  → Phase 1 scene (renderAt(time)) → PNG frames → H.264 MP4 + original voice
  → jobs/<job-id>/output/final.mp4
```

Cursor builds this repository. **OpenCode** is the intended AI orchestrator (skills + commands included).

## Status

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Foundation + deterministic render/encode | **Complete** |
| 2 | Audio/script analysis + timeline engine | **Complete** |
| 3 | Storyboard planning + storyboard Canvas scene | **Complete** |
| 4 | Advanced 2D (motifs, transitions, typography, FX) | **Complete** |
| 5 | Three.js / WebGL deterministic 3D scene | **Complete** |
| 6 | Cinematic camera moves (dolly/orbit/crane/handheld) | **Complete** |
| 7+ | Visual QC / auto-repair / long-form | Not started |

## Prerequisites

| Tool | Notes |
|------|-------|
| Node.js 20+ | `node -v` |
| FFmpeg + FFprobe | on `PATH`, or `FFMPEG_PATH` / `FFPROBE_PATH` in `.env` |
| Playwright Chromium | `npx playwright install chromium` |

Windows-first. PowerShell-friendly scripts (no bash required).

## Setup

```bash
npm install
npx playwright install chromium
npm run check-env
```

## Quick start

```bash
# Demo (creates/uses examples/demo voiceover + script)
npm run demo

# Your files
#   input/script.txt
#   input/voiceover.mp3
npm run generate -- --input input

# Analysis only
npm run analyze -- --input input --debug

# Storyboard only (needs analyzed job)
npm run storyboard -- --job jobs/job-YYYYMMDD-NNN

# Re-render an existing job
npm run render -- --job jobs/job-YYYYMMDD-NNN
```

## CLI

| Command | Purpose |
|---------|---------|
| `npm run check-env` | Verify Node / FFmpeg / FFprobe / Chromium |
| `npm run analyze` | Phase 2 → `analysis/timeline.json` |
| `npm run storyboard` | Phase 3 → `analysis/storyboard.json` |
| `npm run generate` | Analyze + storyboard + render + encode + mux |
| `npm run render` | Render from existing job timeline/storyboard |
| `npm run validate-timeline` | Validate `timeline.json` |
| `npm run debug` | Inspect job artifacts / debug analysis |
| `npm run demo` | End-to-end sample |
| `npm test` | Unit + integration tests |

Common flags: `--script`, `--audio`, `--input`, `--fps`, `--resolution`, `--jobs-dir`, `--clean-frames`, `--recompute`, `--no-cache`, `--debug`, `--engine estimated|whisper`, `--planner heuristic|llm|auto`, `--scene storyboard|threejs|basic`, `--skip-storyboard`.

### Phase 5 Three.js

```bash
npm run generate -- --input input --scene threejs
```

Uses a local `three` build copied into the job `scenes/vendor/` folder (works with `file://` / Playwright, no CDN). Default scene remains `storyboard` (Canvas 2D).

### Phase 6 cinematic camera

Heuristic (and LLM) storyboards set `visualIntent.camera` per shot (`move`, `ease`, `intensity`, `zoom`/`pan`/`roll`/`fov`). Both `storyboard` and `threejs` scenes evaluate moves over shot-local progress — dolly, orbit, crane, handheld, push-slide, whip-pan. Explicit `camera.from` / `camera.to` keyframes override procedural moves.

## Input format

```
input/
├── script.txt      Full prose or markdown headings (Phase 2 analyzes all sentences)
└── voiceover.mp3   mp3 | wav | m4a | aac
```

## Job output

```
jobs/job-YYYYMMDD-NNN/
├── input/
├── audio/analysis.json
├── analysis/
│   ├── script.json
│   ├── audio.json
│   ├── transcript.json
│   ├── alignment.json
│   ├── pauses.json
│   ├── narrative.json
│   ├── importance.json
│   ├── timeline.json
│   └── storyboard.json
├── scenes/
├── frames/
├── output/final.mp4
├── logs/pipeline.log
└── metadata.json
```

## Transcription

- **Default `estimated`:** local, no model download. Maps script sentences onto speech regions by word weight. Provenance marked `estimated`.
- **Optional `whisper`:** `npm install` (optionalDependency `@xenova/transformers`), then `--engine whisper` or `TRANSCRIPTION_ENGINE=whisper`. First run downloads the model.

## OpenCode integration

```
.opencode/
├── skills/video-generation/SKILL.md
└── commands/
    ├── generate-video.md
    ├── analyze-video.md
    ├── render-video.md
    ├── validate-timeline.md
    └── debug-video.md
```

Open this folder in OpenCode. Use `/generate-video`, `/analyze-video`, `/render-video`, etc. OpenCode should call the npm scripts above — not reimplement rendering.

## Configuration

Copy `.env.example` → `.env` for machine-specific paths and Phase 2 thresholds (`HOOK_WINDOW_SEC`, `ALIGNMENT_THRESHOLD`, `SILENCE_NOISE_DB`, …).

## Tests

```bash
npm test
```

Missing FFmpeg/Chromium skips related tests unless `REQUIRE_E2E=1`.

## Troubleshooting

| Message | Fix |
|---------|-----|
| FFmpeg/FFprobe not found | Install FFmpeg; set PATH or `.env` |
| Chromium not installed | `npx playwright install chromium` |
| Timeline invalid | `npm run debug -- --job …` then `analyze --force` |
| Whisper unavailable | Use `--engine estimated` or install `@xenova/transformers` |

## Phase 3 storyboard

Default planner is **heuristic** (offline): maps narrative role + importance + text cues → mood / layout / motion / palette / visualPrompt.

Optional LLM planner (OpenAI-compatible):

```bash
# .env
STORYBOARD_PLANNER=llm
STORYBOARD_API_KEY=...
# or OPENAI_API_KEY=...
npm run generate -- --input input --planner llm
```

The `storyboard` scene renders those intents as deterministic Canvas compositions (not Three.js).

### Phase 4 advanced 2D

Each shot can include:
- **motif** — geometric, waveform, constellation, grid, ribbons, rings, bars, aurora
- **transition** — soft-fade, rise-blur, wipe-soft, zoom-punch, slide-stack, glitch-snap
- **typography** — display, editorial, mono-tech, bold-impact
- **fx** — glow, vignette, parallax, scan

Presets live in `src/visuals2d/presets.js` and are applied by the heuristic planner per narrative role.

## Known limitations

- Default transcription is estimated unless Whisper is configured.
- Heuristic camera + 2D/3D improve look, but not full LLM cinematic art direction.
- Narrative roles remain heuristics unless an external agent supplies a storyboard JSON.
- Per-frame Playwright screenshots are correct but slow on long videos.
- Fonts depend on the host OS (Segoe UI on Windows).

## Roadmap

1. Foundation ✓ · 2. Timeline engine ✓ · 3. Storyboard ✓ · 4. Advanced 2D ✓ · 5. Three.js/WebGL ✓ · 6. Cinematic ✓ · 7. Visual QC · 8. Self-repair · 9. Long-form · 10. Production

## License

Private project (`private: true` in package.json).
