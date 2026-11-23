# Architecture (Phase 1 + Phase 2)

## Data flow

```
scripts/generate-video.js  (CLI)
        │
        ▼
src/pipeline/analyzeVideo.js  (Phase 2)
  1 script parse → script.json
  2 audio analysis (FFprobe + silencedetect) → audio.json
  3 transcription (estimated | whisper) → transcript.json
  4 alignment → alignment.json
  5 pauses → pauses.json
  6 narrative heuristics → narrative.json
  7 importance → importance.json
  8 timeline engine + validation → timeline.json
        │
        ▼
src/pipeline/generateVideo.js  (Phase 1 render)
  9 generateScene (basic HTML/Canvas + narration from timeline)
 10 renderFrames (Playwright renderAt(t) → PNG)
 11 encodeFrames (FFmpeg H.264)
 12 mergeAudio (original voiceover)
 13 verifyOutput (FFprobe)
```

## Contracts

- **Audio** is the master clock (`timeline.audio.masterClock = true`).
- **timeline.json v2.0** is the contract between analysis and future visual generation.
- Scenes include `visualIntent: { type: "placeholder" }` for Phase 3 storyboards (not implemented).
- `window.renderAt(time)` must be a pure function of time.

## Modules

| Concern | Path |
|---------|------|
| Script parse | `src/analysis/scriptParser.js` |
| Normalize / sentences | `src/analysis/normalize.js` |
| Audio + silence | `src/analysis/audioAnalysis.js` |
| Transcription | `src/analysis/transcription/` |
| Alignment | `src/analysis/alignment.js` |
| Pauses | `src/analysis/pauses.js` |
| Narrative / hook | `src/analysis/narrative.js` |
| Importance | `src/analysis/importance.js` |
| Cache | `src/analysis/cache.js` |
| Timeline | `src/timeline/engine.js`, `validate.js` |
| Render / encode | `src/renderer/` |

## OpenCode

Cursor implements this repository. OpenCode later loads:

- `.opencode/skills/video-generation/SKILL.md`
- `.opencode/commands/*.md`

OpenCode orchestrates via `npm run …` commands; it does not need renderer internals.

## Phase boundary

Phase 3+ (AI storyboard, Three.js, QC, auto-repair) must not be implemented until explicitly requested.
