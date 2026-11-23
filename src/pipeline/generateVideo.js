/**
 * Full pipeline orchestrator (Phase 1 render + Phase 2 analysis).
 *
 * Script + Voiceover
 *   -> Phase 2 analysis (timeline.json)
 *   -> deterministic scene (uses timeline narration when available)
 *   -> Playwright frames -> FFmpeg encode -> original voiceover -> final.mp4
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { checkDependencies } from './checkDependencies.js';
import { createTimeline } from './timeline.js';
import { generateScene } from '../scenes/index.js';
import { renderFrames } from '../renderer/renderer.js';
import { encodeFrames, mergeAudio } from '../renderer/encoder.js';
import { verifyOutput } from './verifyOutput.js';
import { updateMetadata } from './job.js';
import { analyzeVideo } from './analyzeVideo.js';

/**
 * @param {object} options
 */
export async function generateVideo(options) {
  const config = getConfig(options);
  const logger = options.logger || createLogger();
  const timings = {};
  const started = Date.now();
  let job = null;

  try {
    const deps = await checkDependencies(config);
    logger.info(`FFmpeg ${deps.ffmpeg} / FFprobe ${deps.ffprobe} / Chromium OK`);

    // Phase 2 analysis (creates job, copies inputs, writes analysis/*)
    const analysis = await analyzeVideo({
      ...options,
      logger,
      skipDepsCheck: true,
      createJobIfMissing: true,
      force: options.force,
      noCache: options.noCache,
      debug: options.debug
    });
    job = analysis.job;
    const audio = analysis.audio;
    const script = analysis.script;
    const timelineDoc = analysis.timeline;

    const frameTimeline = createTimeline({ durationSec: audio.durationSec, fps: config.fps });
    logger.info(`Timeline: ${frameTimeline.totalFrames} frames @ ${config.fps} fps`);
    logger.info(`Narrative scenes: ${timelineDoc.scenes?.length || 0}, segments: ${timelineDoc.segments?.length || 0}`);

    const finalPath = path.join(job.paths.output, 'final.mp4');
    updateMetadata(job, {
      status: 'rendering',
      fps: config.fps,
      resolution: { width: config.width, height: config.height },
      totalFrames: frameTimeline.totalFrames,
      outputPath: finalPath,
      phase: 2
    });

    // Scene — Phase 1 basic renderer enriched with Phase 2 timeline narration
    const title = script.sentences?.[0]?.text || 'Untitled';
    const subtitle = script.sentences?.[1]?.text || null;
    const scene = generateScene(config.sceneName, {
      sceneDir: job.paths.scenes,
      title: title.length > 80 ? `${title.slice(0, 79)}…` : title,
      subtitle: subtitle ? (subtitle.length > 120 ? `${subtitle.slice(0, 119)}…` : subtitle) : null,
      durationSec: audio.durationSec,
      fps: config.fps,
      width: config.width,
      height: config.height,
      timeline: timelineDoc
    });
    logger.info(`Scene generated: ${path.basename(scene.sceneHtmlPath)} (${scene.name})`);
    updateMetadata(job, { scene: { name: scene.name, path: scene.sceneHtmlPath } });

    let t0 = Date.now();
    const rendered = await renderFrames({
      sceneHtmlPath: scene.sceneHtmlPath,
      framesDir: job.paths.frames,
      timeline: frameTimeline,
      width: config.width,
      height: config.height,
      config,
      logger,
      maxFrames: options.maxFrames
    });
    timings.renderSec = (Date.now() - t0) / 1000;

    updateMetadata(job, { status: 'encoding' });
    logger.info('Encoding video');
    t0 = Date.now();
    const silentVideo = path.join(job.paths.output, 'video_silent.mp4');
    await encodeFrames({ framesDir: job.paths.frames, fps: config.fps, outputPath: silentVideo, config });
    timings.encodeSec = (Date.now() - t0) / 1000;

    updateMetadata(job, { status: 'merging' });
    logger.info('Merging voiceover');
    const mergeAudioPath =
      audio.path ||
      fs.readdirSync(job.paths.input)
        .map((f) => path.join(job.paths.input, f))
        .find((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
    if (!mergeAudioPath) {
      throw new VideoGenError(ErrorCodes.AUDIO_MISSING, 'Could not locate voiceover file for muxing.');
    }
    await mergeAudio({
      videoPath: silentVideo,
      audioPath: mergeAudioPath,
      audioCodec: audio.codec,
      outputPath: finalPath,
      config
    });
    fs.rmSync(silentVideo, { force: true });

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
    updateMetadata(job, {
      status: 'completed',
      framesRendered: rendered.framesRendered,
      verification,
      timings,
      analysisCacheKey: analysis.cacheKey
    });

    return {
      jobId: job.id,
      jobDir: job.dir,
      outputPath: finalPath,
      durationSec: audio.durationSec,
      fps: config.fps,
      width: config.width,
      height: config.height,
      totalFrames: frameTimeline.totalFrames,
      framesRendered: rendered.framesRendered,
      verification,
      timings,
      timeline: timelineDoc,
      analysisPaths: analysis.paths
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
