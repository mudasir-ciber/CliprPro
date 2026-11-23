#!/usr/bin/env node
/**
 * Render from an existing analyzed job (timeline already present).
 * Reuses job analysis artifacts and re-runs scene → frames → encode → mux.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getConfig } from '../src/config.js';
import { createLogger } from '../src/utils/logger.js';
import { createTimeline } from '../src/pipeline/timeline.js';
import { generateScene } from '../src/scenes/index.js';
import { renderFrames } from '../src/renderer/renderer.js';
import { encodeFrames, mergeAudio } from '../src/renderer/encoder.js';
import { verifyOutput } from '../src/pipeline/verifyOutput.js';
import { updateMetadata } from '../src/pipeline/job.js';
import { checkDependencies } from '../src/pipeline/checkDependencies.js';
import { runVisualQc } from '../src/qc/runQc.js';
import { VideoGenError, ErrorCodes } from '../src/utils/errors.js';
import { fail, printRel } from './cli-shared.js';

const USAGE = `Usage:
  npm run render -- --job jobs/<job-id> [--fps 30] [--resolution 1920x1080] [--clean-frames] [--skip-qc] [--qc-strict]`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      job: { type: 'string' },
      fps: { type: 'string' },
      resolution: { type: 'string' },
      'clean-frames': { type: 'boolean', default: false },
      'skip-qc': { type: 'boolean', default: false },
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
  const metadataPath = path.join(jobDir, 'metadata.json');
  const timelinePath = path.join(jobDir, 'analysis', 'timeline.json');
  const scriptPath = path.join(jobDir, 'analysis', 'script.json');
  if (!fs.existsSync(timelinePath)) throw new VideoGenError(ErrorCodes.TIMELINE_INVALID, `Missing timeline: ${timelinePath}`);
  if (!fs.existsSync(metadataPath)) throw new VideoGenError(ErrorCodes.ANALYSIS_FAILED, `Missing metadata: ${metadataPath}`);

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const timelineDoc = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const storyboardPath = path.join(jobDir, 'analysis', 'storyboard.json');
  const storyboard = fs.existsSync(storyboardPath) ? JSON.parse(fs.readFileSync(storyboardPath, 'utf8')) : null;
  const audioFile = fs.readdirSync(path.join(jobDir, 'input')).map((f) => path.join(jobDir, 'input', f)).find((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
  if (!audioFile) throw new VideoGenError(ErrorCodes.AUDIO_MISSING, 'No voiceover in job input/');

  const audioJson = JSON.parse(fs.readFileSync(path.join(jobDir, 'analysis', 'audio.json'), 'utf8'));
  const config = getConfig({
    fps: values.fps,
    resolution: values.resolution,
    keepFrames: !values['clean-frames'],
    sceneName: storyboard ? 'storyboard' : undefined,
    skipQc: values['skip-qc'],
    qcStrict: values['qc-strict']
  });
  const logger = createLogger();
  logger.attachFile(path.join(jobDir, 'logs', 'pipeline.log'));

  const job = {
    id: metadata.jobId || path.basename(jobDir),
    dir: jobDir,
    paths: {
      root: jobDir,
      metadata: metadataPath,
      input: path.join(jobDir, 'input'),
      audio: path.join(jobDir, 'audio'),
      analysis: path.join(jobDir, 'analysis'),
      scenes: path.join(jobDir, 'scenes'),
      frames: path.join(jobDir, 'frames'),
      output: path.join(jobDir, 'output'),
      logs: path.join(jobDir, 'logs')
    }
  };

  await checkDependencies(config);
  const frameTimeline = createTimeline({ durationSec: audioJson.durationSec, fps: config.fps });
  // clear old frames
  fs.rmSync(job.paths.frames, { recursive: true, force: true });
  fs.mkdirSync(job.paths.frames, { recursive: true });

  const title = script.sentences?.[0]?.text || 'Untitled';
  const scene = generateScene(config.sceneName, {
    sceneDir: job.paths.scenes,
    title: title.slice(0, 80),
    subtitle: script.sentences?.[1]?.text?.slice(0, 120) || null,
    durationSec: audioJson.durationSec,
    fps: config.fps,
    width: config.width,
    height: config.height,
    timeline: timelineDoc,
    storyboard
  });

  updateMetadata(job, { status: 'rendering' });
  await renderFrames({
    sceneHtmlPath: scene.sceneHtmlPath,
    framesDir: job.paths.frames,
    timeline: frameTimeline,
    width: config.width,
    height: config.height,
    config,
    logger
  });

  let qc = null;
  if (!config.skipQc) {
    updateMetadata(job, { status: 'qc' });
    logger.info('Running visual QC');
    qc = await runVisualQc({
      framesDir: job.paths.frames,
      timeline: frameTimeline,
      width: config.width,
      height: config.height,
      config,
      storyboard,
      timelineDoc,
      outDir: job.paths.analysis,
      logger
    });
  }

  const silentVideo = path.join(job.paths.output, 'video_silent.mp4');
  const finalPath = path.join(job.paths.output, 'final.mp4');
  updateMetadata(job, { status: 'encoding' });
  await encodeFrames({ framesDir: job.paths.frames, fps: config.fps, outputPath: silentVideo, config });
  updateMetadata(job, { status: 'merging' });
  await mergeAudio({
    videoPath: silentVideo,
    audioPath: audioFile,
    audioCodec: audioJson.codec,
    outputPath: finalPath,
    config
  });
  fs.rmSync(silentVideo, { force: true });

  const verification = await verifyOutput({
    videoPath: finalPath,
    expected: { width: config.width, height: config.height, durationSec: audioJson.durationSec },
    ffprobePath: config.ffprobePath
  });
  if (!config.keepFrames) {
    fs.rmSync(job.paths.frames, { recursive: true, force: true });
    fs.mkdirSync(job.paths.frames);
  }
  updateMetadata(job, {
    status: 'completed',
    verification,
    qc: qc ? { passed: qc.passed, path: qc.path, summary: qc.summary } : null,
    outputPath: finalPath
  });
  console.log(
    `\nRENDER COMPLETE\nOutput:\n${printRel(finalPath)}\nVisual QC: ${qc ? (qc.passed ? 'passed' : 'failed') : '(skipped)'}\n`
  );
} catch (err) {
  fail(err);
}
