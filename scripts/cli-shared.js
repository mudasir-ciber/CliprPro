/** Shared CLI helpers for Windows-friendly scripts. */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveInputDir } from '../src/pipeline/validateInputs.js';
import { VideoGenError } from '../src/utils/errors.js';

export function baseOptions() {
  return {
    script: { type: 'string' },
    audio: { type: 'string' },
    input: { type: 'string' },
    fps: { type: 'string' },
    resolution: { type: 'string' },
    'jobs-dir': { type: 'string' },
    'clean-frames': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    recompute: { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
    debug: { type: 'boolean', default: false },
    engine: { type: 'string' },
    planner: { type: 'string' },
    storyboard: { type: 'string' },
    scene: { type: 'string' },
    'skip-storyboard': { type: 'boolean', default: false },
    'skip-qc': { type: 'boolean', default: false },
    'qc-strict': { type: 'boolean', default: false },
    'skip-repair': { type: 'boolean', default: false },
    'repair-attempts': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false }
  };
}

export function parseCli(extraOptions = {}) {
  try {
    const { values } = parseArgs({ options: { ...baseOptions(), ...extraOptions } });
    return values;
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

export function resolvePaths(values) {
  let scriptPath = values.script;
  let audioPath = values.audio;
  if (!scriptPath || !audioPath) {
    const found = resolveInputDir(values.input || 'input');
    scriptPath = scriptPath || found.scriptPath;
    audioPath = audioPath || found.audioPath;
  }
  return { scriptPath, audioPath };
}

export function fail(err) {
  if (err instanceof VideoGenError) {
    console.error(`\nERROR (${err.code}): ${err.message}`);
  } else {
    console.error(`\nERROR: Unexpected failure: ${err.message}`);
  }
  if (err.logPath) console.error(`Job: ${err.jobId}\nFull details in log: ${err.logPath}`);
  process.exit(1);
}

export function printRel(p) {
  return path.relative(process.cwd(), p) || p;
}
