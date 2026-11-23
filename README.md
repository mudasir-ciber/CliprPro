# CliprPro

**Local-first, code-driven AI video generation** (OpenCode-ready) — **v1.0.0**.

Not a neural text-to-video model. The system analyzes a **script + voiceover** into a validated **timeline**, renders deterministic HTML/Canvas (or Three.js) scenes with Playwright, runs visual QC + self-repair, muxes the **original voiceover** with FFmpeg, and ships a **production delivery package**.

```
Script + Voiceover
  → analysis + timeline (audio = master clock)
  → storyboard visualIntent (+ cinematic camera)
  → chunked/parallel renderAt(time) → PNG → H.264 + original voice
  → QC → self-repair (bounded)
  → delivery/ handoff (titles, chapters, thumbnail, disclosure)
  → jobs/<job-id>/output/final.mp4
```

## Status

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Foundation + deterministic render/encode | **Complete** |
| 2 | Audio/script analysis + timeline engine | **Complete** |
| 3 | Storyboard planning + storyboard Canvas scene | **Complete** |
| 4 | Advanced 2D (motifs, transitions, typography, FX) | **Complete** |
| 5 | Three.js / WebGL deterministic 3D scene | **Complete** |
| 6 | Cinematic camera moves | **Complete** |
| 7 | Visual QC | **Complete** |
| 8 | Self-repair | **Complete** |
| 9 | Long-form chunked / parallel render | **Complete** |
| 10 | Production packaging | **Complete** |

See [docs/RELEASE.md](docs/RELEASE.md) for the production checklist.

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
npm run doctor
```

## Quick start

```bash
npm run demo

# Your files: input/script.txt + input/voiceover.mp3
npm run generate -- --input input --clean-frames

# Re-package a finished job
npm run package -- --job jobs/job-YYYYMMDD-NNN
```

## CLI

| Command | Purpose |
|---------|---------|
| `npm run doctor` | Production readiness (deps + phases) |
| `npm run check-env` | Verify Node / FFmpeg / FFprobe / Chromium |
| `npm run analyze` | Phase 2 → `analysis/timeline.json` |
| `npm run storyboard` | Phase 3 → `analysis/storyboard.json` |
| `npm run generate` | Full pipeline + QC + repair + packaging |
| `npm run render` | Re-render from existing job |
| `npm run qc` | Visual QC on existing `frames/` |
| `npm run package` | Phase 10 delivery handoff for a job |
| `npm run validate-timeline` | Validate `timeline.json` |
| `npm run debug` | Inspect job artifacts |
| `npm run demo` | End-to-end sample |
| `npm test` | Unit + integration tests |

Common flags: `--script`, `--audio`, `--input`, `--fps`, `--resolution`, `--jobs-dir`, `--clean-frames`, `--recompute`, `--no-cache`, `--debug`, `--engine estimated|whisper`, `--planner heuristic|llm|auto`, `--scene storyboard|threejs|basic`, `--skip-storyboard`, `--skip-qc`, `--qc-strict`, `--skip-repair`, `--repair-attempts`, `--workers`, `--chunk-size`, `--no-resume`, `--skip-package`.

### Phase 10 delivery

After a successful generate (unless `--skip-package`):

```
jobs/<id>/delivery/
  final.mp4
  thumbnail.jpg
  delivery.json
  titles.txt
  description.txt
  chapters.txt
  chapters.json
  disclosure.txt
```

## Input format

```
input/
├── script.txt
└── voiceover.mp3   mp3 | wav | m4a | aac
```

## Job output

```
jobs/job-YYYYMMDD-NNN/
├── analysis/          timeline, storyboard, qc, repair, render…
├── scenes/
├── frames/            (optional; cleaned with --clean-frames)
├── output/            final.mp4 + packaging sidecars
├── delivery/          flat handoff copy
├── logs/pipeline.log
└── metadata.json
```

## OpenCode

```
.opencode/skills/video-generation/SKILL.md
.opencode/commands/*.md
```

Open this folder in OpenCode. Prefer `npm run …` orchestration — do not reimplement rendering.

## Configuration

Copy `.env.example` → `.env` for machine-specific paths and thresholds.

## Tests

```bash
npm test
```

## Known limitations

- Default transcription is estimated unless Whisper is configured.
- Heuristic camera + 2D/3D improve look, but not full LLM cinematic art direction.
- Narrative roles remain heuristics unless an external agent supplies a storyboard JSON.
- Per-frame Playwright capture is correct; use Phase 9 workers for longer jobs.
- Fonts depend on the host OS (Segoe UI on Windows).

## Roadmap

1–10 complete (production). Further work is iterative product improvement.

## License

Private project (`private: true` in package.json).
