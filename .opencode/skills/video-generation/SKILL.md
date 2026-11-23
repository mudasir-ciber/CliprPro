---
name: video-generation
description: Operate CliprPro 1.0 — local-first code-driven video pipeline through production packaging (analyze, storyboard, parallel render, QC, self-repair, delivery handoff). Use when the user asks to generate, analyze, storyboard, render, qc, package, validate, doctor, or debug a video.
---

# CliprPro Video Generation Skill (v1.0 — Phases 1–10)

## Purpose

Code-driven video generator. The AI does NOT paint pixels.

```
script + voiceover
  → analysis → timeline.json
  → storyboard.json
  → chunked/parallel Playwright PNGs
  → visual QC (+ self-repair)
  → FFmpeg + ORIGINAL voiceover → final.mp4
  → delivery/ handoff (titles, chapters, thumbnail, disclosure)
```

## Production commands

```bash
npm run doctor
npm run generate -- --input input
npm run package -- --job jobs/<id>
npm run qc -- --job jobs/<id>
npm run render -- --job jobs/<id>
npm test
```

## Recommended flow

1. `npm run doctor` → READY  
2. Confirm `script.txt` + `voiceover.*`  
3. `npm run generate -- --input input --clean-frames`  
4. Report Job ID, `final.mp4`, `delivery/` contents  
5. On failure: `ERROR (CODE)` + `logs/pipeline.log` once  

## Delivery handoff

```
jobs/<id>/delivery/
  final.mp4
  thumbnail.jpg
  delivery.json
  titles.txt
  description.txt
  chapters.txt
  disclosure.txt
```

## Notes

- Audio duration is the master clock.
- Deterministic `renderAt(time)` — parallel workers are safe.
- `--skip-package` disables Phase 10 only.
