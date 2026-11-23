---
description: Generate a video (final.mp4) from a script and a voiceover using the Phase 1 pipeline
---

Use the `video-generation` skill to generate a video.

User arguments: `$ARGUMENTS`

Steps:

1. Run `npm run check-env`. If anything fails, show the exact message and stop. Do not try to work around missing FFmpeg or Chromium.
2. Decide the inputs:
   - If the arguments contain `--script` / `--audio` / `--input`, pass them through unchanged.
   - Otherwise use the default input folder: `--input input` (expects `input/script.txt` and `input/voiceover.mp3|wav|m4a|aac`).
   - If a required file is missing, tell the user exactly which file and where to put it. Do not invent a script or audio.
3. Run: `npm run generate -- <arguments from step 2>`
4. If it succeeds, report: Job ID, duration, FPS, resolution, and the output path (`jobs/<job-id>/output/final.mp4`). Confirm the file exists.
5. If it fails, report the `ERROR (CODE)` line, then read `jobs/<job-id>/logs/pipeline.log` and summarise the real cause in one or two sentences. Do not retry in a loop.

Rules: only use the repository pipeline; do not write a new renderer; do not claim success unless the command completed.
