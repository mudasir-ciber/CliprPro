---
description: Build Phase 10 production delivery package for a completed job
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Resolve `--job jobs/<id>` (required). Job must already have `output/final.mp4`.
2. Run: `npm run package -- --job <path>`
3. Report titles, chapter count, and paths to `output/delivery.json` + `delivery/` handoff folder (final.mp4, thumbnail, chapters, description, disclosure).
4. On failure report `ERROR (CODE)` once.

Rules: do not re-render unless the user asks; packaging only assembles sidecars from existing artifacts.
