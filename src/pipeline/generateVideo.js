/**
 * Full pipeline orchestrator (Phase 1–3).
 *
 * Script + Voiceover
 *   -> Phase 2 analysis (timeline.json)
 *   -> Phase 3 storyboard (visualIntent per scene)
 *   -> deterministic scene renderAt(time)
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
import { planStoryboardForJob } from './planStoryboard.js';

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
    let timelineDoc = analysis.timeline;
    let storyboard = null;

    // Phase 3 storyboard
    if (!config.skipStoryboard) {
      const planned = await planStoryboardForJob({
        job,
        jobDir: job.dir,
        timeline: timelineDoc,
        script,
        logger,
        planner: options.planner || config.storyboardPlanner,
        storyboardPath: options.storyboardPath,
        storyboardPlanner: options.planner || config.storyboardPlanner,
        storyboardApiKey: config.storyboardApiKey,
        storyboardApiUrl: config.storyboardApiUrl,
        storyboardModel: config.storyboardModel
      });
      timelineDoc = planned.timeline;
      storyboard = planned.storyboard;
      timings.storyboardSec = (Date.now() - started) / 1000;
    }

    const frameTimeline = createTimeline({ durationSec: audio.durationSec, fps: config.fps });
    logger.info(`Timeline: ${frameTimeline.totalFrames} frames @ ${config.fps} fps`);
    logger.info(`Narrative scenes: ${timelineDoc.scenes?.length || 0}, storyboard shots: ${storyboard?.shots?.length || 0}`);

    const finalPath = path.join(job.paths.output, 'final.mp4');
    updateMetadata(job, {
      status: 'rendering',
      fps: config.fps,
      resolution: { width: config.width, height: config.height },
      totalFrames: frameTimeline.totalFrames,
      outputPath: finalPath,
      phase: storyboard ? 3 : 2
    });

    const title = script.sentences?.[0]?.text || 'Untitled';
    const subtitle = script.sentences?.[1]?.text || null;
    const sceneName = options.sceneName || config.sceneName || (storyboard ? 'storyboard' : 'basic');
    const scene = generateScene(sceneName, {
      sceneDir: job.paths.scenes,
      title: title.length > 80 ? `${title.slice(0, 79)}…` : title,
      subtitle: subtitle ? (subtitle.length > 120 ? `${subtitle.slice(0, 119)}…` : subtitle) : null,
      durationSec: audio.durationSec,
      fps: config.fps,
      width: config.width,
      height: config.height,
      timeline: timelineDoc,
      storyboard
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
      analysisCacheKey: analysis.cacheKey,
      phase: storyboard ? 3 : 2
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
      storyboard,
      analysisPaths: {
        ...analysis.paths,
        storyboard: storyboard ? path.join(job.paths.analysis, 'storyboard.json') : null
      }
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
