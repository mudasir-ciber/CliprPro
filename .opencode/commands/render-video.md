---
description: Re-render frames and encode MP4 from an existing analyzed job timeline
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Require `--job jobs/<job-id>` (must contain `analysis/timeline.json` and `input/` voiceover).
2. Run `npm run check-env` (needs Chromium + FFmpeg).
3. Run: `npm run render -- --job <job-path> <other args>`
4. Report `output/final.mp4` path and verification summary.
5. On failure, read `logs/pipeline.log` and summarize once.
