---
description: Inspect analysis artifacts and logs for a job, or re-run analysis with debug dumps
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. If `--job` is provided: `npm run debug -- --job <path>` and summarize sentence timing, alignment confidence, pauses, segments, importance, timeline validation, and log tail.
2. Otherwise run analysis with debug: `npm run debug -- --input input` (or explicit script/audio).
3. Do not modify renderer internals; only use debug/analyze commands.
