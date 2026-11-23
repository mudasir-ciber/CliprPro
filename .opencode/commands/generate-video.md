---
description: Analyze + storyboard + generate final.mp4 + delivery package (Phases 1–10)
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Run `npm run doctor` (or `npm run check-env`). Stop on failure.
2. Resolve inputs (`--script` / `--audio` / `--input`, default `--input input`).
3. Run: `npm run generate -- <arguments>`
   - Phases 1–9 pipeline (storyboard, QC, repair, long-form render) as previously documented.
   - Phase 10 packaging runs by default; `--skip-package` only if requested.
4. On success report Job ID, media stats, QC/repair, delivery titles, `output/final.mp4`, `delivery/` handoff folder.
5. On failure report `ERROR (CODE)` and summarize `logs/pipeline.log` once.

Rules: use repository pipeline only; phases 1–10 are the production surface.
