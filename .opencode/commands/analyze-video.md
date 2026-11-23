---
description: Run Phase 2 analysis only (script/audio/transcript/alignment/timeline.json)
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Ensure FFmpeg/FFprobe are available (`npm run check-env` is enough; Chromium is not required for analyze-only).
2. Resolve `--script` / `--audio` / `--input` (default `--input input`).
3. Run: `npm run analyze -- <arguments>` (add `--debug` if the user wants timing dumps, `--force` to bypass cache).
4. Report Job ID, sentence/scene/pause counts, timeline validity, engine name, and path to `analysis/timeline.json`.
5. If timeline is invalid, print validation errors and stop with non-success.
