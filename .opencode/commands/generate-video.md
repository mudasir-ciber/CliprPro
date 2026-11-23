---
description: Analyze + storyboard + generate final.mp4 (Phases 1–8)
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Run `npm run check-env`. Stop on failure with the exact message.
2. Resolve inputs (`--script` / `--audio` / `--input`, default `--input input`).
3. Run: `npm run generate -- <arguments>`
   - Default planner is heuristic storyboard (Phases 3–6 visualIntent + camera).
   - Pass `--planner llm` only if the user requests LLM planning and keys exist.
   - Pass `--skip-storyboard` only if the user wants Phase 2 visuals only.
   - Pass `--scene threejs` for Phase 5 WebGL + Phase 6 camera (default is `storyboard` Canvas 2D).
   - Phase 7 visual QC runs by default after frames; use `--skip-qc` only if requested; `--qc-strict` promotes warnings.
   - Phase 8 self-repair runs on QC failure (default max 2). Use `--skip-repair` or `--repair-attempts n` when requested.
4. On success report Job ID, duration, FPS, resolution, storyboard shot count/planner, camera moves, QC pass/fail, repair attempts, `output/final.mp4`, `analysis/timeline.json`, `analysis/storyboard.json`, `analysis/qc.json`, `analysis/repair.json` if present.
5. On failure report `ERROR (CODE)` and summarize `logs/pipeline.log` once.

Rules: use repository pipeline only; do not claim Phase 9+ features.
