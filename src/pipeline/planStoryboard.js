/**
 * Phase 3 orchestrator: timeline → storyboard.json → enriched timeline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { planStoryboard, applyStoryboardToTimeline, validateStoryboard } from '../storyboard/index.js';
import { updateMetadata } from './job.js';

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Plan (or load) a storyboard for a job / timeline.
 *
 * @param {object} options
 * @param {string} [options.jobDir]
 * @param {object} [options.timeline]
 * @param {object} [options.script]
 * @param {string} [options.storyboardPath] existing storyboard to apply
 * @param {string} [options.planner] heuristic|llm|auto
 */
export async function planStoryboardForJob(options = {}) {
  const config = getConfig(options);
  const logger = options.logger || createLogger();
  const jobDir = options.jobDir ? path.resolve(options.jobDir) : null;

  let timeline = options.timeline || null;
  let script = options.script || null;
  let analysisDir = options.analysisDir || null;
  let job = options.job || null;

  if (jobDir) {
    analysisDir = path.join(jobDir, 'analysis');
    const timelinePath = path.join(analysisDir, 'timeline.json');
    const scriptPath = path.join(analysisDir, 'script.json');
    if (!timeline && fs.existsSync(timelinePath)) timeline = readJson(timelinePath);
    if (!script && fs.existsSync(scriptPath)) script = readJson(scriptPath);
    if (!job) {
      job = {
        id: path.basename(jobDir),
        dir: jobDir,
        paths: {
          metadata: path.join(jobDir, 'metadata.json'),
          analysis: analysisDir,
          logs: path.join(jobDir, 'logs')
        }
      };
      if (fs.existsSync(path.join(jobDir, 'logs'))) {
        logger.attachFile(path.join(jobDir, 'logs', 'pipeline.log'));
      }
    }
  }

  if (!timeline) {
    throw new VideoGenError(ErrorCodes.TIMELINE_INVALID, 'No timeline available. Run analyze first or pass --job.');
  }
  if (!analysisDir) {
    analysisDir = jobDir ? path.join(jobDir, 'analysis') : path.resolve(config.jobsDir, '_analysis');
  }
  fs.mkdirSync(analysisDir, { recursive: true });

  let storyboard;
  if (options.storyboardPath) {
    const abs = path.resolve(options.storyboardPath);
    if (!fs.existsSync(abs)) {
      throw new VideoGenError(ErrorCodes.STORYBOARD_MISSING, `Storyboard file not found: ${abs}`);
    }
    storyboard = readJson(abs);
    logger.info(`Loaded storyboard: ${abs}`);
  } else {
    const planner = options.planner || config.storyboardPlanner;
    logger.info(`Planning storyboard (planner=${planner})`);
    storyboard = await planStoryboard({
      timeline,
      script: script || { sentences: [] },
      config,
      planner
    });
  }

  const check = validateStoryboard(storyboard);
  if (!check.valid) {
    throw new VideoGenError(
      ErrorCodes.STORYBOARD_INVALID,
      `Storyboard validation failed: ${check.errors.map((e) => e.message).join('; ')}`,
      { details: JSON.stringify(check) }
    );
  }

  const applied = applyStoryboardToTimeline(timeline, storyboard);
  writeJson(path.join(analysisDir, 'storyboard.json'), applied.storyboard);
  writeJson(path.join(analysisDir, 'timeline.json'), applied.timeline);

  if (job?.paths?.metadata) {
    updateMetadata(job, {
      status: 'storyboarded',
      phase: 3,
      storyboardPath: path.join(analysisDir, 'storyboard.json'),
      storyboardPlanner: applied.storyboard.planner,
      timelineValid: applied.timeline.validation?.valid
    });
  }

  logger.info(
    `Storyboard ready: ${applied.storyboard.shots.length} shots (${applied.storyboard.planner})`
  );

  return {
    jobId: job?.id || timeline.jobId || null,
    job,
    storyboard: applied.storyboard,
    timeline: applied.timeline,
    paths: {
      analysisDir,
      storyboard: path.join(analysisDir, 'storyboard.json'),
      timeline: path.join(analysisDir, 'timeline.json')
    }
  };
}
