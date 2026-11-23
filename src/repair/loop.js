/**
 * Phase 8 bounded self-repair loop: QC → plan → patch storyboard → re-render → QC.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateScene } from '../scenes/index.js';
import { renderFrames } from '../renderer/renderer.js';
import { runVisualQc } from '../qc/runQc.js';
import { applyStoryboardToTimeline } from '../storyboard/apply.js';
import { planRepair } from './plan.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { updateMetadata } from '../pipeline/job.js';

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function clearFrames(framesDir) {
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
}

/**
 * Render (+ optional QC + repair retries).
 *
 * @returns {Promise<{rendered, qc, storyboard, timelineDoc, scene, repair}>}
 */
export async function renderWithSelfRepair(ctx) {
  const {
    job,
    config,
    logger,
    frameTimeline,
    sceneName,
    sceneOptions,
    timelineDoc: initialTimeline,
    storyboard: initialStoryboard,
    maxFrames
  } = ctx;

  const maxAttempts = Math.max(0, Number(config.repairMaxAttempts ?? 2));
  const skipRepair = config.skipRepair === true;
  const attempts = [];
  let timelineDoc = initialTimeline;
  let storyboard = initialStoryboard;
  let scene = generateScene(sceneName, {
    ...sceneOptions,
    timeline: timelineDoc,
    storyboard
  });
  logger.info(`Scene generated: ${path.basename(scene.sceneHtmlPath)} (${scene.name})`);
  updateMetadata(job, { scene: { name: scene.name, path: scene.sceneHtmlPath } });

  let rendered = null;
  let qc = null;
  let attempt = 0;

  while (true) {
    updateMetadata(job, { status: 'rendering', repairAttempt: attempt });
    if (attempt > 0) {
      clearFrames(job.paths.frames);
      logger.info(`Self-repair re-render attempt ${attempt}/${maxAttempts}`);
    }

    const t0 = Date.now();
    rendered = await renderFrames({
      sceneHtmlPath: scene.sceneHtmlPath,
      framesDir: job.paths.frames,
      timeline: frameTimeline,
      width: config.width,
      height: config.height,
      config,
      logger,
      maxFrames
    });
    const renderSec = (Date.now() - t0) / 1000;

    if (config.skipQc) {
      logger.info('Visual QC skipped');
      return {
        rendered,
        qc: null,
        storyboard,
        timelineDoc,
        scene,
        repair: { version: '8.0', phase: 8, attempted: false, attempts, timings: { renderSec } }
      };
    }

    updateMetadata(job, { status: 'qc' });
    logger.info(attempt === 0 ? 'Running visual QC' : `Re-running visual QC (attempt ${attempt})`);
    const tQc = Date.now();
    // Soft mode during loop so we can repair; final throw handled below
    const softConfig = { ...config, qcFailOnError: false };
    qc = await runVisualQc({
      framesDir: job.paths.frames,
      timeline: frameTimeline,
      width: config.width,
      height: config.height,
      config: softConfig,
      storyboard,
      timelineDoc,
      outDir: job.paths.analysis,
      logger
    });
    // Keep attempt snapshots
    if (qc.path) {
      const snap = path.join(job.paths.analysis, `qc-attempt-${attempt}.json`);
      fs.copyFileSync(qc.path, snap);
    }
    const qcSec = (Date.now() - tQc) / 1000;

    attempts.push({
      attempt,
      passed: qc.passed,
      errorCount: qc.summary?.errorCount ?? 0,
      warningCount: qc.summary?.warningCount ?? 0,
      issueCodes: (qc.issues || []).map((i) => i.code),
      renderSec,
      qcSec
    });

    if (qc.passed) {
      const repairReport = buildRepairReport({
        attempts,
        success: true,
        storyboard,
        finalQc: qc
      });
      writeRepairArtifacts(job, repairReport, storyboard, timelineDoc);
      updateMetadata(job, {
        qc: { passed: qc.passed, path: qc.path, summary: qc.summary },
        repair: { attempted: attempts.length > 1, attempts: attempts.length, passed: true }
      });
      return { rendered, qc, storyboard, timelineDoc, scene, repair: repairReport };
    }

    // QC failed
    if (skipRepair || attempt >= maxAttempts) {
      const repairReport = buildRepairReport({
        attempts,
        success: false,
        storyboard,
        finalQc: qc,
        exhausted: !skipRepair
      });
      writeRepairArtifacts(job, repairReport, storyboard, timelineDoc);
      const top = (qc.issues || []).find((i) => i.severity === 'error') || (qc.issues || [])[0];
      throw new VideoGenError(
        skipRepair ? ErrorCodes.QC_FAILED : ErrorCodes.REPAIR_FAILED,
        skipRepair
          ? `Visual QC failed: ${top?.message || 'unknown'}`
          : `Self-repair exhausted after ${attempt} attempt(s): ${top?.message || 'unknown'}`,
        {
          details: JSON.stringify({
            attempts: attempts.length,
            codes: (qc.issues || []).map((i) => i.code)
          })
        }
      );
    }

    const plan = planRepair(qc, storyboard, {
      attempt: attempt + 1,
      repairOnWarnings: config.repairOnWarnings,
      qcStrict: config.qcStrict
    });
    attempts[attempts.length - 1].repairPlan = {
      needed: plan.needed,
      reason: plan.reason,
      actions: plan.actions.map((a) => a.type)
    };

    if (!plan.needed) {
      const repairReport = buildRepairReport({
        attempts,
        success: false,
        storyboard,
        finalQc: qc,
        exhausted: true
      });
      writeRepairArtifacts(job, repairReport, storyboard, timelineDoc);
      throw new VideoGenError(
        ErrorCodes.REPAIR_FAILED,
        `Visual QC failed and no repair strategy matched: ${(qc.issues || []).map((i) => i.code).join(', ')}`,
        { details: JSON.stringify(qc.summary) }
      );
    }

    logger.info(`Self-repair plan: ${plan.reason}`);
    if (plan.needsStoryboardPatch && plan.storyboard) {
      storyboard = plan.storyboard;
      if (timelineDoc) {
        const applied = applyStoryboardToTimeline(timelineDoc, storyboard);
        timelineDoc = applied.timeline;
        storyboard = applied.storyboard;
      }
      writeJson(path.join(job.paths.analysis, 'storyboard.json'), storyboard);
      writeJson(path.join(job.paths.analysis, 'timeline.json'), timelineDoc);
      scene = generateScene(sceneName, {
        ...sceneOptions,
        timeline: timelineDoc,
        storyboard
      });
      logger.info(`Scene regenerated after repair (${scene.name})`);
    }

    attempt += 1;
  }
}

function buildRepairReport({ attempts, success, storyboard, finalQc, exhausted = false }) {
  return {
    version: '8.0',
    phase: 8,
    generatedAt: new Date().toISOString(),
    attempted: attempts.length > 1 || attempts.some((a) => a.repairPlan?.needed),
    success,
    exhausted,
    attemptCount: attempts.length,
    attempts,
    finalPassed: finalQc?.passed ?? false,
    storyboardRepaired: Boolean(storyboard?.repaired),
    path: null
  };
}

function writeRepairArtifacts(job, repairReport, storyboard, timelineDoc) {
  const repairPath = path.join(job.paths.analysis, 'repair.json');
  repairReport.path = repairPath;
  writeJson(repairPath, repairReport);
  if (storyboard) writeJson(path.join(job.paths.analysis, 'storyboard.json'), storyboard);
  if (timelineDoc) writeJson(path.join(job.paths.analysis, 'timeline.json'), timelineDoc);
}
