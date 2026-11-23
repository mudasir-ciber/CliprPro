#!/usr/bin/env node
/**
 * Phase 10: build production delivery package for an existing completed job.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getConfig } from '../src/config.js';
import { createLogger } from '../src/utils/logger.js';
import { packageDelivery } from '../src/package/delivery.js';
import { VideoGenError, ErrorCodes } from '../src/utils/errors.js';
import { fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run package -- --job jobs/<job-id>

Writes output/delivery.json, thumbnail, chapters, titles, description, disclosure
and a flat jobs/<id>/delivery/ handoff folder.`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      job: { type: 'string' },
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
  const metadataPath = path.join(jobDir, 'metadata.json');
  const finalPath = path.join(jobDir, 'output', 'final.mp4');
  if (!fs.existsSync(finalPath)) {
    throw new VideoGenError(ErrorCodes.PACKAGE_FAILED, `Missing final.mp4 at ${finalPath}. Generate/render first.`);
  }
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : {};
  const analysisDir = path.join(jobDir, 'analysis');
  const read = (name) => {
    const p = path.join(analysisDir, name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const script = read('script.json');
  const timelineDoc = read('timeline.json');
  const storyboard = read('storyboard.json');
  const qc = read('qc.json');
  const repair = read('repair.json');
  const audio = read('audio.json');

  const config = getConfig({
    fps: metadata.fps,
    width: metadata.resolution?.width,
    height: metadata.resolution?.height
  });
  const logger = createLogger();
  logger.attachFile(path.join(jobDir, 'logs', 'pipeline.log'));

  const job = {
    id: metadata.jobId || path.basename(jobDir),
    dir: jobDir,
    paths: {
      root: jobDir,
      metadata: metadataPath,
      output: path.join(jobDir, 'output'),
      analysis: analysisDir,
      logs: path.join(jobDir, 'logs')
    }
  };

  const delivery = await packageDelivery({
    job,
    script,
    timelineDoc,
    storyboard,
    qc,
    repair,
    verification: metadata.verification || null,
    fps: metadata.fps || config.fps,
    width: metadata.resolution?.width || config.width,
    height: metadata.resolution?.height || config.height,
    durationSec: audio?.durationSec || metadata.verification?.durationSec,
    finalPath,
    config,
    logger,
    sceneName: metadata.scene?.name
  });

  console.log(`
DELIVERY PACKAGE READY

Job: ${job.id}
Titles: ${delivery.packaging.titles.join(' | ')}
Chapters: ${delivery.packaging.chapters.length}
Delivery JSON: ${printRel(delivery.paths.deliveryJson)}
Handoff folder: ${printRel(delivery.paths.deliveryDir)}
${delivery.paths.thumbnail ? `Thumbnail: ${printRel(delivery.paths.thumbnail)}` : ''}
`);
} catch (err) {
  fail(err);
}
