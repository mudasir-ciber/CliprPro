# CliprPro 1.0.0 — Production release

## What’s included

Phases **1–10** are complete:

1. Foundation render/encode  
2. Timeline + audio/script analysis  
3. Storyboard planner  
4. Advanced 2D visuals  
5. Three.js scene  
6. Cinematic camera  
7. Visual QC  
8. Self-repair  
9. Long-form parallel render  
10. Production delivery packaging  

## Pre-flight

```bash
npm install
npx playwright install chromium
npm run doctor
npm test
```

`doctor` must print `READY`.

## Ship a video

```bash
# inputs: input/script.txt + input/voiceover.mp3
npm run generate -- --input input --clean-frames

# or package an existing completed job
npm run package -- --job jobs/job-YYYYMMDD-NNN
```

Handoff folder:

```
jobs/<id>/delivery/
  final.mp4
  thumbnail.jpg
  delivery.json
  titles.txt
  description.txt
  chapters.txt
  chapters.json
  disclosure.txt
```

## Production checklist

- [ ] `npm run doctor` → READY  
- [ ] Script + voiceover validated  
- [ ] `final.mp4` plays with original voiceover  
- [ ] `delivery.json` chapters align with narration  
- [ ] Thumbnail is representative  
- [ ] Disclosure included for AI/code-driven content policies  

## Support surface

| Command | Role |
|---------|------|
| `npm run doctor` | Production readiness |
| `npm run generate` | Full pipeline + packaging |
| `npm run package` | Re-package a finished job |
| `npm run qc` | Visual QC only |
| `npm run debug` | Inspect failed jobs |
