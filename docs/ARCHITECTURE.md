# Architecture (Phase 1)

## Data flow

```
scripts/generate-video.js  (CLI)
        │
        ▼
src/pipeline/generateVideo.js  (orchestrator)
  1 checkDependencies     FFmpeg, FFprobe, Playwright, Chromium
  2 validateInputs        script + audio, FFprobe metadata
  3 createTimeline        totalFrames = ceil(duration * fps)
  4 createJob             jobs/job-YYYYMMDD-NNN/... + metadata.json + pipeline.log
  5 generateScene         scenes/scene.html (+ scene.config.json)
  6 renderFrames          Playwright: renderAt(t) -> PNG, one browser, one page
  7 encodeFrames          FFmpeg: PNG sequence -> H.264 (silent)
  8 mergeAudio            FFmpeg: copy video, add ORIGINAL voiceover
  9 verifyOutput          FFprobe: streams, resolution, duration
```

## Determinism contract

A scene exposes `window.renderAt(time)` and `window.__sceneReady = true`. Pixels must be a pure function
of `time`. Frame `i` is rendered at `t = i / fps`. No realtime clock, no unseeded randomness.
`tests/renderer.test.js` verifies this (same time, same pixels, in any call order).

## Why jobs are created after validation

A bad input never leaves an empty job folder. Once a job exists, every failure is written to
`metadata.json` (`status: failed`, `error.code`) and to `logs/pipeline.log`.

## Extension points for later phases

| Phase | Where it plugs in |
|-------|-------------------|
| 2 Audio + timeline | extend `src/pipeline/timeline.js` and `src/audio/` (speech/sentence timing) |
| 3 Storyboard / planner | new module producing a scene plan; `generateScene` receives it instead of a single title |
| 4 / 5 / 6 Visuals | new scene generators registered in `src/scenes/index.js` (same `renderAt` contract) |
| 7 QC | new step between `renderFrames` and `encodeFrames`; screenshots already exist in `frames/` |
| 8 Self-correction | wraps scene generation + render with a bounded retry; errors already carry codes + details |
| 9 Long-form | replace per-frame screenshots with chunked/parallel rendering; `renderFrames` has `maxFrames` already |

## Decisions

- **No runtime dependencies except Playwright.** `.env` loader, CLI parsing (`node:util`), tests (`node:test`) are built in.
- **No shell** when spawning FFmpeg/FFprobe (`spawn` with argument arrays) — safe for Windows paths with spaces.
- **Audio:** AAC is stream-copied; other codecs become AAC 256 kbps (MP4-safe). No `-shortest`, so the voiceover is never truncated.
- **Frame numbering** starts at `frame_000001.png` (what FFmpeg's `%06d` pattern expects).
