/**
 * Phase 1 pipeline orchestrator.
 *
 * Script + Voiceover -> validation -> audio analysis -> job -> scene -> deterministic
 * Playwright rendering -> FFmpeg encode -> original voiceover merge -> final.mp4
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { VideoGenError } from '../utils/errors.js';
import { checkDependencies } from './checkDependencies.js';
import { validateInputs } from './validateInputs.js';
import { createJob, updateMetadata } from './job.js';
import { createTimeline } from './timeline.js';
import { generateScene } from '../scenes/index.js';
import { renderFrames } from '../renderer/renderer.js';
import { encodeFrames, mergeAudio } from '../renderer/encoder.js';
import { verifyOutput } from './verifyOutput.js';

/**
 * @param {object} options
 * @param {string} options.scriptPath
 * @param {string} options.audioPath
 * @param {number} [options.fps]
 * @param {string} [options.resolution]   "1920x1080"
 * @param {string} [options.jobsDir]
 * @param {boolean} [options.keepFrames]
 * @param {number} [options.maxFrames]    render only first N frames (testing only)
 * @param {object} [options.logger]
 */
export async function generateVideo(options) {
  const config = getConfig(options);
  const logger = options.logger || createLogger();
  const timings = {};
  const started = Date.now();
  let job = null;

  try {
    // 1. Dependencies (fail early with clear messages)
    const deps = await checkDependencies(config);
    logger.info(`FFmpeg ${deps.ffmpeg} / FFprobe ${deps.ffprobe} / Chromium OK`);

    // 2. Inputs + audio analysis
    const { script, audio } = await validateInputs({
      scriptPath: options.scriptPath,
      audioPath: options.audioPath,
      ffprobePath: config.ffprobePath
    });
    const timeline = createTimeline({ durationSec: audio.durationSec, fps: config.fps });

    // 3. Job
    job = createJob({ jobsDir: config.jobsDir });
    logger.attachFile(path.join(job.paths.logs, 'pipeline.log'));
    logger.info(`Job created: ${job.id}`);

    const scriptCopy = path.join(job.paths.input, path.basename(script.path));
    const audioCopy = path.join(job.paths.input, path.basename(audio.path));
    fs.copyFileSync(script.path, scriptCopy);
    fs.copyFileSync(audio.path, audioCopy);
    logger.info(`Script loaded: ${script.path} (${script.bytes} bytes)`);
    logger.info(`Audio detected: ${audio.path}`);
    logger.info(`Audio duration: ${audio.durationSec.toFixed(2)}s`);
    logger.info(`Audio format: ${audio.format}, ${audio.sampleRate} Hz, ${audio.channels} ch, codec ${audio.codec}`);
    logger.info(`Timeline: ${timeline.totalFrames} frames @ ${config.fps} fps`);
    fs.writeFileSync(path.join(job.paths.audio, 'analysis.json'), JSON.stringify(audio, null, 2));

    const finalPath = path.join(job.paths.output, 'final.mp4');
    updateMetadata(job, {
      jobId: job.id,
      createdAt: job.createdAt,
      phase: 1,
      status: 'created',
      scriptPath: scriptCopy,
      audioPath: audioCopy,
      originalScriptPath: script.path,
      originalAudioPath: audio.path,
      audioDurationSec: audio.durationSec,
      audio: { format: audio.format, codec: audio.codec, sampleRate: audio.sampleRate, channels: audio.channels },
      fps: config.fps,
      resolution: { width: config.width, height: config.height },
      totalFrames: timeline.totalFrames,
      outputPath: finalPath,
      error: null
    });

    // 4. Scene
    const scene = generateScene(config.sceneName, {
      sceneDir: job.paths.scenes,
      title: script.title,
      subtitle: script.subtitle,
      durationSec: audio.durationSec,
      fps: config.fps,
      width: config.width,
      height: config.height
    });
    logger.info(`Scene generated: ${path.basename(scene.sceneHtmlPath)} (${scene.name})`);
    updateMetadata(job, { status: 'rendering', scene: { name: scene.name, path: scene.sceneHtmlPath } });

    // 5. Render frames
    let t0 = Date.now();
    const rendered = await renderFrames({
      sceneHtmlPath: scene.sceneHtmlPath,
      framesDir: job.paths.frames,
      timeline,
      width: config.width,
      height: config.height,
      config,
      logger,
      maxFrames: options.maxFrames
    });
    timings.renderSec = (Date.now() - t0) / 1000;

    // 6. Encode
    updateMetadata(job, { status: 'encoding' });
    logger.info('Encoding video');
    t0 = Date.now();
    const silentVideo = path.join(job.paths.output, 'video_silent.mp4');
    await encodeFrames({ framesDir: job.paths.frames, fps: config.fps, outputPath: silentVideo, config });
    timings.encodeSec = (Date.now() - t0) / 1000;

    // 7. Merge original voiceover
    updateMetadata(job, { status: 'merging' });
    logger.info('Merging voiceover');
    await mergeAudio({ videoPath: silentVideo, audioPath: audioCopy, audioCodec: audio.codec, outputPath: finalPath, config });
    fs.rmSync(silentVideo, { force: true });

    // 8. Verify
    const verification = await verifyOutput({
      videoPath: finalPath,
      expected: { width: config.width, height: config.height, durationSec: audio.durationSec },
      ffprobePath: config.ffprobePath
    });
    for (const w of verification.warnings) logger.warn(w);
    logger.info('Final video created');

    if (!config.keepFrames) {
      fs.rmSync(job.paths.frames, { recursive: true, force: true });
      fs.mkdirSync(job.paths.frames);
      logger.info('Frames removed (--clean-frames)');
    }

    timings.totalSec = (Date.now() - started) / 1000;
    updateMetadata(job, { status: 'completed', framesRendered: rendered.framesRendered, verification, timings });

    return {
      jobId: job.id,
      jobDir: job.dir,
      outputPath: finalPath,
      durationSec: audio.durationSec,
      fps: config.fps,
      width: config.width,
      height: config.height,
      totalFrames: timeline.totalFrames,
      framesRendered: rendered.framesRendered,
      verification,
      timings
    };
  } catch (err) {
    const known = err instanceof VideoGenError;
    const firstLine = String(err.message).split('\n')[0];
    logger.error(known ? `[${err.code}] ${firstLine}` : `Unexpected error: ${firstLine}`);
    if (err.details) logger.detail(`Details: ${err.details}`);
    if (err.stack) logger.detail(`Stack: ${err.stack}`);
    if (job) {
      updateMetadata(job, { status: 'failed', error: { code: known ? err.code : 'UNEXPECTED', message: err.message } });
      err.jobId = job.id;
      err.logPath = logger.filePath;
    }
    throw err;
  }
}
