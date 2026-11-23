#!/usr/bin/env node
/**
 * Phase 7: run visual QC on an existing job's rendered frames.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getConfig } from '../src/config.js';
import { createLogger } from '../src/utils/logger.js';
import { createTimeline } from '../src/pipeline/timeline.js';
import { runVisualQc } from '../src/qc/runQc.js';
import { VideoGenError, ErrorCodes } from '../src/utils/errors.js';
import { fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run qc -- --job jobs/<job-id> [--qc-strict]

Requires frames/ to still exist (do not use --clean-frames before QC).`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      job: { type: 'string' },
      'qc-strict': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  }));
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}

if (values.help || !values.job) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}

try {
  const jobDir = path.resolve(values.job);
  const framesDir = path.join(jobDir, 'frames');
  const analysisDir = path.join(jobDir, 'analysis');
  const metadataPath = path.join(jobDir, 'metadata.json');
  const audioJsonPath = path.join(analysisDir, 'audio.json');
  if (!fs.existsSync(framesDir)) {
    throw new VideoGenError(ErrorCodes.QC_FAILED, `Missing frames directory: ${framesDir}`);
  }
  const frameCount = fs.readdirSync(framesDir).filter((f) => /^frame_\d+\.png$/i.test(f)).length;
  if (!frameCount) {
    throw new VideoGenError(
      ErrorCodes.QC_FAILED,
      'No PNG frames found. Re-render without --clean-frames, then run qc.'
    );
  }

  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : {};
  const audio = fs.existsSync(audioJsonPath) ? JSON.parse(fs.readFileSync(audioJsonPath, 'utf8')) : null;
  const fps = metadata.fps || 30;
  const width = metadata.resolution?.width || 1920;
  const height = metadata.resolution?.height || 1080;
  const durationSec = audio?.durationSec || frameCount / fps;
  const timelineDoc = fs.existsSync(path.join(analysisDir, 'timeline.json'))
    ? JSON.parse(fs.readFileSync(path.join(analysisDir, 'timeline.json'), 'utf8'))
    : null;
  const storyboard = fs.existsSync(path.join(analysisDir, 'storyboard.json'))
    ? JSON.parse(fs.readFileSync(path.join(analysisDir, 'storyboard.json'), 'utf8'))
    : null;

  const config = getConfig({
    fps,
    width,
    height,
    qcStrict: values['qc-strict'],
    qcFailOnError: true
  });
  const logger = createLogger();
  logger.attachFile(path.join(jobDir, 'logs', 'pipeline.log'));

  const frameTimeline = createTimeline({ durationSec, fps });
  // Prefer actual frame count if metadata duration mismatch
  if (frameCount !== frameTimeline.totalFrames) {
    frameTimeline.totalFrames = frameCount;
  }

  const qc = await runVisualQc({
    framesDir,
    timeline: frameTimeline,
    width,
    height,
    config,
    storyboard,
    timelineDoc,
    outDir: analysisDir,
    logger
  });

  console.log(`
VISUAL QC ${qc.passed ? 'PASSED' : 'FAILED'}

Job: ${path.basename(jobDir)}
Samples: ${qc.summary.samplesAnalyzed}/${qc.summary.totalFrames}
Errors: ${qc.summary.errorCount}
Warnings: ${qc.summary.warningCount}
Report: ${printRel(qc.path)}
${qc.contactSheet ? `Contact: ${printRel(path.join(analysisDir, qc.contactSheet))}` : ''}
`);
  if (!qc.passed) process.exit(1);
} catch (err) {
  fail(err);
}
