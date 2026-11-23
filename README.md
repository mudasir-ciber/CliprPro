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
| 3+ | AI storyboard / 3D / QC / repair | Not started (interfaces only) |

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

# Re-render an existing job
npm run render -- --job jobs/job-YYYYMMDD-NNN
```

## CLI

| Command | Purpose |
|---------|---------|
| `npm run check-env` | Verify Node / FFmpeg / FFprobe / Chromium |
| `npm run analyze` | Phase 2 → `analysis/timeline.json` |
| `npm run generate` | Analyze + render + encode + mux |
| `npm run render` | Render from existing job timeline |
| `npm run validate-timeline` | Validate `timeline.json` |
| `npm run debug` | Inspect job artifacts / debug analysis |
| `npm run demo` | End-to-end sample |
| `npm test` | Unit + integration tests |

Common flags: `--script`, `--audio`, `--input`, `--fps`, `--resolution`, `--jobs-dir`, `--clean-frames`, `--force`, `--no-cache`, `--debug`, `--engine estimated|whisper`.

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
│   └── timeline.json
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

## Known limitations (Phase 2)

- Basic Canvas scene only (timeline-aware narration text — not AI storyboards).
- Default transcription is estimated unless Whisper is configured.
- Narrative roles are **heuristics**, not LLM classification.
- Per-frame Playwright screenshots are correct but slow on long videos.
- Fonts depend on the host OS (Segoe UI on Windows).

## Roadmap

1. Foundation ✓ · 2. Timeline engine ✓ · 3. AI storyboard · 4. Advanced 2D · 5. Three.js/WebGL · 6. Cinematic · 7. Visual QC · 8. Self-repair · 9. Long-form · 10. Production

## License

Private project (`private: true` in package.json).
