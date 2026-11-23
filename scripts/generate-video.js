#!/usr/bin/env node
/**
 * CLI entry point (used by npm run generate and the /generate-video OpenCode command).
 *
 *   node scripts/generate-video.js --script input/script.txt --audio input/voiceover.mp3
 *   node scripts/generate-video.js --input input
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { generateVideo } from '../src/pipeline/generateVideo.js';
import { resolveInputDir } from '../src/pipeline/validateInputs.js';
import { VideoGenError } from '../src/utils/errors.js';

const USAGE = `Usage:
  npm run generate -- --script <script.txt> --audio <voiceover.mp3> [options]
  npm run generate -- --input <folder>        (folder contains script.txt + voiceover.mp3|wav|m4a|aac)

Options:
  --script <path>        Script text file
  --audio <path>         Voiceover file (mp3, wav, m4a, aac)
  --input <folder>       Input folder (default: ./input)
  --fps <number>         Frames per second (default: 30)
  --resolution <WxH>     Output resolution (default: 1920x1080)
  --jobs-dir <folder>    Where jobs are created (default: ./jobs)
  --clean-frames         Delete PNG frames after the video is created
  -h, --help             Show this help`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      script: { type: 'string' },
      audio: { type: 'string' },
      input: { type: 'string' },
      fps: { type: 'string' },
      resolution: { type: 'string' },
      'jobs-dir': { type: 'string' },
      'clean-frames': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (err) {
  console.error(`ERROR: ${err.message}\n\n${USAGE}`);
  process.exit(2);
}

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

let scriptPath = values.script;
let audioPath = values.audio;
if (!scriptPath || !audioPath) {
  const found = resolveInputDir(values.input || 'input');
  scriptPath = scriptPath || found.scriptPath;
  audioPath = audioPath || found.audioPath;
}

try {
  const result = await generateVideo({
    scriptPath,
    audioPath,
    fps: values.fps,
    resolution: values.resolution,
    jobsDir: values['jobs-dir'],
    keepFrames: !values['clean-frames']
  });
  const rel = path.relative(process.cwd(), result.outputPath) || result.outputPath;
  console.log(`
VIDEO GENERATION COMPLETE

Job ID: ${result.jobId}
Duration: ${result.durationSec.toFixed(2)} sec
FPS: ${result.fps}
Resolution: ${result.width}x${result.height}

Output:
${rel}
`);
} catch (err) {
  if (err instanceof VideoGenError) {
    console.error(`\nERROR (${err.code}): ${err.message}`);
  } else {
    console.error(`\nERROR: Unexpected failure: ${err.message}`);
  }
  if (err.logPath) console.error(`Job: ${err.jobId}\nFull details in log: ${err.logPath}`);
  process.exit(1);
}
