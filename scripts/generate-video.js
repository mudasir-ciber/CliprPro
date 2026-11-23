#!/usr/bin/env node
/**
 * Full generate: Phase 2 analysis + Phase 1 render/encode/mux.
 */
import { generateVideo } from '../src/pipeline/generateVideo.js';
import { parseCli, resolvePaths, fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run generate -- --script <script.txt> --audio <voiceover.mp3> [options]
  npm run generate -- --input <folder>

Options:
  --fps <n>              Frames per second (default: 30)
  --resolution <WxH>     Default 1920x1080
  --jobs-dir <folder>
  --clean-frames         Delete PNG frames after success
  --recompute            Recompute analysis (ignore cache; prefer over --force with npm)
  --no-cache
  --debug                Dump analysis debug info
  --engine <name>        estimated (default) | whisper
  --planner <name>       storyboard planner: heuristic (default) | llm | auto
  --storyboard <file>    apply an existing storyboard.json
  --scene <name>         storyboard (default) | threejs | basic
  --skip-storyboard      Phase 2 timeline only (skip Phase 3)
  --skip-qc              Skip Phase 7 visual QC
  --qc-strict            Treat QC warnings as failures
  --skip-repair          Disable Phase 8 self-repair loop
  --repair-attempts <n>  Max repair re-renders (default 2)
  -h, --help`;

const values = parseCli();
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const { scriptPath, audioPath } = resolvePaths(values);
if (!scriptPath || !audioPath) {
  console.error('ERROR: Provide --script and --audio, or --input folder with script.txt + voiceover.*\n\n' + USAGE);
  process.exit(2);
}

try {
  const result = await generateVideo({
    scriptPath,
    audioPath,
    fps: values.fps,
    resolution: values.resolution,
    jobsDir: values['jobs-dir'],
    keepFrames: !values['clean-frames'],
    force: values.force || values.recompute,
    noCache: values['no-cache'],
    debug: values.debug,
    transcriptionEngine: values.engine,
    planner: values.planner,
    storyboardPath: values.storyboard,
    sceneName: values.scene,
    skipStoryboard: values['skip-storyboard'],
    skipQc: values['skip-qc'],
    qcStrict: values['qc-strict'],
    skipRepair: values['skip-repair'],
    repairMaxAttempts: values['repair-attempts']
  });

  console.log(`
VIDEO GENERATION COMPLETE

Job ID: ${result.jobId}
Duration: ${result.durationSec.toFixed(2)} sec
FPS: ${result.fps}
Resolution: ${result.width}x${result.height}
Timeline scenes: ${result.timeline?.scenes?.length ?? 0}
Storyboard shots: ${result.storyboard?.shots?.length ?? 0}
Planner: ${result.storyboard?.planner ?? '(skipped)'}
Timeline valid: ${result.timeline?.validation?.valid}
Visual QC: ${result.qc ? (result.qc.passed ? 'passed' : 'failed') : '(skipped)'}
Self-repair: ${result.repair ? (result.repair.attempted ? `${result.repair.attemptCount} attempt(s), ${result.repair.success ? 'ok' : 'failed'}` : 'not needed') : '(n/a)'}

Output:
${printRel(result.outputPath)}

Timeline:
${printRel(result.analysisPaths.timeline)}
${result.analysisPaths.storyboard ? `Storyboard:\n${printRel(result.analysisPaths.storyboard)}\n` : ''}${result.analysisPaths.qc ? `QC:\n${printRel(result.analysisPaths.qc)}\n` : ''}${result.analysisPaths.repair ? `Repair:\n${printRel(result.analysisPaths.repair)}\n` : ''}`);
} catch (err) {
  fail(err);
}
