---
description: Validate jobs/<id>/analysis/timeline.json against the Phase 2 contract
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. Resolve `--file` path (default suggestion: `jobs/<latest>/analysis/timeline.json` if the user named a job).
2. Run: `npm run validate-timeline -- --file <path>`
3. Report `valid`, list errors and warnings from the JSON output.
4. Exit intent: valid → success; invalid → failure with actionable messages.
