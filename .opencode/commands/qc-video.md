---
description: Run Phase 7 visual QC on an existing job's PNG frames
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Resolve `--job jobs/<id>` (required). Frames must still exist (no prior `--clean-frames` wipe).
2. Run: `npm run qc -- --job <path> [--qc-strict]`
3. On success report passed/failed, sample counts, error/warning counts, paths to `analysis/qc.json` and `qc-contact.png` if present.
4. On `QC_FAILED`, summarize top issue codes from `qc.json` and suggest re-render (do not invent fixes — Phase 8 self-repair is not available).

Rules: use repository pipeline only; do not claim Phase 8+ auto-repair.
