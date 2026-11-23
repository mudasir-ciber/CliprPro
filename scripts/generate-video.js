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
    transcriptionEngine: values.engine
  });

  console.log(`
VIDEO GENERATION COMPLETE

Job ID: ${result.jobId}
Duration: ${result.durationSec.toFixed(2)} sec
FPS: ${result.fps}
Resolution: ${result.width}x${result.height}
Timeline scenes: ${result.timeline?.scenes?.length ?? 0}
Timeline valid: ${result.timeline?.validation?.valid}

Output:
${printRel(result.outputPath)}

Timeline:
${printRel(result.analysisPaths.timeline)}
`);
} catch (err) {
  fail(err);
}
