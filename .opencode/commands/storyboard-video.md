---
description: Plan Phase 3 storyboard (visualIntent per timeline scene) for a job or inputs
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

Steps:

1. If `--job` is provided, run: `npm run storyboard -- --job <path> [--planner heuristic|llm|auto]`
2. Otherwise resolve `--input` / `--script` / `--audio`, then: `npm run storyboard -- --input input [--planner heuristic]`
3. Report Job ID, planner, shot count, moods, and paths to `analysis/storyboard.json` + updated `timeline.json`.
4. Default planner is `heuristic` (offline). Only use `llm` if the user has API keys configured and asks for it.
5. Do not invent storyboard JSON by hand unless the user pastes a plan to save via `--storyboard <file>`.
