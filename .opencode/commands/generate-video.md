---
description: Analyze script+voiceover into a timeline and generate final.mp4 (Phase 1+2 pipeline)
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Run `npm run check-env`. If anything fails, show the exact message and stop.
2. Resolve inputs:
   - Pass through `--script` / `--audio` / `--input` / other flags from arguments.
   - Default: `--input input` (expects `script.txt` + `voiceover.mp3|wav|m4a|aac`).
   - If a required file is missing, tell the user exactly which file. Do not invent inputs.
3. Run: `npm run generate -- <arguments from step 2>`
4. On success, report Job ID, duration, FPS, resolution, timeline scene count, `jobs/<id>/output/final.mp4`, and `jobs/<id>/analysis/timeline.json`. Confirm files exist.
5. On failure, report `ERROR (CODE)`, summarize `jobs/<id>/logs/pipeline.log`, do not retry in a loop.

Rules: only use the repository pipeline; do not claim Phase 3 AI storyboard features; do not claim success unless the command completed.
