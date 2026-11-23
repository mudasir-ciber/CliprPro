---
description: Install and verify CliprPro on this machine (deps, Chromium, doctor)
---

Use the `video-generation` skill.

User arguments: `$ARGUMENTS`

You are setting up CliprPro for a non-technical user. Do the work yourself — do not ask them to run commands unless a tool is missing and needs a manual download (FFmpeg installer, Node installer).

Steps (run in order, stop only on real failure):

1. Confirm this folder is the CliprPro repo (`package.json` name `cliprpro`). If not, clone:
   `git clone https://github.com/mudasir-ciber/CliprPro.git`
   then work inside that directory.
2. Run `npm install`.
3. Run `npx playwright install chromium`.
4. Run `npm run doctor`.
5. If doctor fails on FFmpeg/FFprobe: explain in 3 short lines how to install FFmpeg on their OS and set `FFMPEG_PATH` / `FFPROBE_PATH` in `.env` (copy from `.env.example`). Do not invent fake paths.
6. If doctor is READY, optionally run `npm run demo` only if the user asked for a test video.
7. Report clearly:
   - READY or NOT READY
   - what was installed
   - next command to generate a video: `npm run generate -- --input input --clean-frames`
   - where output appears: `jobs/<id>/output/final.mp4` and `jobs/<id>/delivery/`

Rules: use repo scripts only; keep messages short and plain language; no coding lectures.
