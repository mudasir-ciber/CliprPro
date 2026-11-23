/**
 * Deterministic frame renderer (Phase 1 + Phase 9 long-form).
 *
 * One browser, N pages (workers). For every frame we call window.renderAt(time)
 * and capture a PNG. Chunked work + optional resume/skipExisting for long jobs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlaywright } from './playwright.js';
import { resolveBrowserLaunch } from './browser.js';
import { needsHttpScene, startStaticServer } from './staticServer.js';
import { frameFileName, frameTime } from '../pipeline/timeline.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';
import { planChunks, resolveWorkerCount, missingFrameIndices, pendingChunks } from './chunks.js';
import { saveProgress, writeRenderReport } from './progress.js';

const MIN_FRAME_BYTES = 64;

/**
 * @param {object} o
 * @param {string} o.sceneHtmlPath
 * @param {string} o.framesDir
 * @param {{totalFrames:number, fps:number, durationSec?:number}} o.timeline
 * @param {number} o.width
 * @param {number} o.height
 * @param {object} o.config
 * @param {object} [o.logger]
 * @param {number} [o.maxFrames]
 * @param {string} [o.analysisDir] for progress/render.json
 * @returns {Promise<{framesRendered:number, framesWritten:number, framesSkipped:number, framesDir:string, workers:number, chunks:number}>}
 */
export async function renderFrames({
  sceneHtmlPath,
  framesDir,
  timeline,
  width,
  height,
  config,
  logger,
  maxFrames,
  analysisDir
}) {
  const { chromium } = await loadPlaywright();
  const total = maxFrames ? Math.min(maxFrames, timeline.totalFrames) : timeline.totalFrames;
  const resume = config?.renderResume !== false;
  const chunkSize = Math.max(1, Number(config?.renderChunkSize) || 90);
  const workers = resolveWorkerCount(total, config || {});
  const started = Date.now();

  fs.mkdirSync(framesDir, { recursive: true });

  const missing = missingFrameIndices(framesDir, total, MIN_FRAME_BYTES);
  const missingSet = new Set(resume ? missing : Array.from({ length: total }, (_, i) => i));
  if (!resume) {
    // force re-write all when resume disabled
    for (let i = 0; i < total; i++) missingSet.add(i);
  }

  const allChunks = planChunks(total, chunkSize);
  const work = pendingChunks(allChunks, missingSet);
  const framesSkipped = total - missingSet.size;

  if (work.length === 0) {
    logger?.info(`All ${total} frames present — resume skip`);
    const report = {
      framesTotal: total,
      framesWritten: 0,
      framesSkipped: total,
      workers,
      chunkSize,
      chunksPlanned: allChunks.length,
      chunksWorked: 0,
      durationMs: Date.now() - started,
      resumed: true
    };
    const renderPath = writeRenderReport(analysisDir || path.join(framesDir, '..', 'analysis'), report);
    saveProgress(analysisDir || path.join(framesDir, '..', 'analysis'), {
      status: 'completed',
      ...report
    });
    return {
      framesRendered: total,
      framesWritten: 0,
      framesSkipped: total,
      framesDir,
      workers,
      chunks: 0,
      reportPath: renderPath
    };
  }

  let browser;
  let staticServer = null;
  try {
    const launch = await resolveBrowserLaunch(config || {});
    const launchOpts = {
      headless: true,
      args: [
        ...(config?.chromiumNoSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle'
      ]
    };
    if (launch.executablePath) launchOpts.executablePath = launch.executablePath;
    else if (launch.channel) launchOpts.channel = launch.channel;
    browser = await chromium.launch(launchOpts);
    logger?.info(`Browser launched (${launch.label})`);
  } catch (err) {
    throw new VideoGenError(
      ErrorCodes.CHROMIUM_MISSING,
      'Could not launch Chromium/Chrome. Run: npx playwright install chromium\nOr install Google Chrome / set CHROMIUM_PATH in .env.',
      { cause: err, details: String(err.message || err) }
    );
  }

  let framesWritten = 0;
  const queue = [...work];

  try {
    const html = fs.readFileSync(sceneHtmlPath, 'utf8');
    let sceneUrl = pathToFileURL(sceneHtmlPath).href;
    if (needsHttpScene(html)) {
      staticServer = await startStaticServer(path.dirname(sceneHtmlPath));
      sceneUrl = staticServer.urlFor(path.basename(sceneHtmlPath));
      logger?.info(`Scene served over HTTP :${staticServer.port}`);
    }

    const workerCount = Math.min(workers, queue.length);
    logger?.info(
      `Rendering frames (${total} @ ${timeline.fps} fps, ${width}x${height}, workers=${workerCount}, chunks=${queue.length}, resume=${resume && framesSkipped > 0})`
    );
    if (framesSkipped > 0) logger?.info(`Resume: skipping ${framesSkipped} existing frame(s)`);

    const sessions = [];
    for (let w = 0; w < workerCount; w++) {
      sessions.push(await openSession(browser, sceneUrl, width, height));
    }
    logger?.info(`Scene loaded: ${path.basename(sceneHtmlPath)}`);

    const progressDir = analysisDir || path.join(framesDir, '..', 'analysis');
    let completedChunks = 0;

    await Promise.all(
      sessions.map(async (session) => {
        while (true) {
          const chunk = queue.shift();
          if (!chunk) break;
          const written = await renderChunk({
            session,
            chunk,
            framesDir,
            timeline,
            total,
            resume
          });
          framesWritten += written;
          completedChunks += 1;
          saveProgress(progressDir, {
            status: 'rendering',
            framesTotal: total,
            framesWritten,
            framesSkipped,
            chunksCompleted: completedChunks,
            chunksRemaining: queue.length,
            workers: workerCount
          });
          const done = framesSkipped + framesWritten;
          logger?.info(
            `Frames ${Math.min(done, total)}/${total} (${Math.round((Math.min(done, total) / total) * 100)}%) [chunk ${chunk.id}]`
          );
        }
      })
    );

    // Verify completeness
    const stillMissing = missingFrameIndices(framesDir, total, MIN_FRAME_BYTES);
    if (stillMissing.length) {
      throw new VideoGenError(
        ErrorCodes.FRAME_CAPTURE_FAILED,
        `Render incomplete: ${stillMissing.length} frame(s) still missing (e.g. ${frameFileName(stillMissing[0])})`,
        { details: stillMissing.slice(0, 20).join(',') }
      );
    }

    logger?.info('Frames completed');
    const report = {
      framesTotal: total,
      framesWritten,
      framesSkipped,
      workers: workerCount,
      chunkSize,
      chunksPlanned: allChunks.length,
      chunksWorked: work.length,
      durationMs: Date.now() - started,
      resumed: framesSkipped > 0
    };
    const renderPath = writeRenderReport(progressDir, report);
    saveProgress(progressDir, { status: 'completed', ...report });

    for (const s of sessions) {
      await s.context.close().catch(() => {});
    }

    return {
      framesRendered: total,
      framesWritten,
      framesSkipped,
      framesDir,
      workers: workerCount,
      chunks: work.length,
      reportPath: renderPath
    };
  } finally {
    await browser.close();
    if (staticServer) await staticServer.close();
  }
}

async function openSession(browser, sceneUrl, width, height) {
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/favicon\.ico/i.test(text)) return;
    if (/Failed to load resource:.*\b404\b/i.test(text) && !/\.(js|mjs|css|html|json|wasm)\b/i.test(text)) return;
    pageErrors.push(`console.error: ${text}`);
  });

  await page.goto(sceneUrl, { waitUntil: 'load' });
  try {
    await page.waitForFunction(
      () => window.__sceneReady === true && typeof window.renderAt === 'function',
      { timeout: 30000 }
    );
  } catch (err) {
    throw new VideoGenError(
      ErrorCodes.SCENE_RENDER_FAILED,
      'Scene did not become ready in time (missing renderAt / __sceneReady).',
      { cause: err, details: pageErrors.join('\n') || String(err.message || err) }
    );
  }
  await assertSceneReady(page, pageErrors);
  return { context, page, pageErrors };
}

async function renderChunk({ session, chunk, framesDir, timeline, total, resume }) {
  const { page, pageErrors } = session;
  const indices = chunk.indices || Array.from({ length: chunk.end - chunk.start }, (_, k) => chunk.start + k);
  let written = 0;
  for (const i of indices) {
    const file = path.join(framesDir, frameFileName(i));
    if (resume && fs.existsSync(file) && fs.statSync(file).size >= MIN_FRAME_BYTES) continue;

    const t = Math.min(frameTime(i, timeline.fps), timeline.durationSec ?? total / timeline.fps);
    try {
      await page.evaluate((time) => window.renderAt(time), t);
    } catch (err) {
      throw new VideoGenError(
        ErrorCodes.SCENE_RENDER_FAILED,
        `Scene failed at t=${t.toFixed(3)}s (frame ${i + 1}): ${firstLine(err)}`,
        { cause: err, details: pageErrors.join('\n') }
      );
    }
    if (pageErrors.length) {
      throw new VideoGenError(
        ErrorCodes.SCENE_RENDER_FAILED,
        `Scene reported a browser error at frame ${i + 1}: ${pageErrors[0]}`,
        { details: pageErrors.join('\n') }
      );
    }
    try {
      await page.screenshot({ path: file, type: 'png' });
    } catch (err) {
      throw new VideoGenError(
        ErrorCodes.FRAME_CAPTURE_FAILED,
        `Could not capture frame ${i + 1}: ${firstLine(err)}`,
        { cause: err }
      );
    }
    written += 1;
  }
  return written;
}

function firstLine(err) {
  return String(err?.message || err).split('\n')[0];
}

async function assertSceneReady(page, pageErrors) {
  const state = await page.evaluate(() => ({
    hasRenderAt: typeof window.renderAt === 'function',
    ready: window.__sceneReady === true
  }));
  if (!state.hasRenderAt || !state.ready) {
    throw new VideoGenError(
      ErrorCodes.SCENE_RENDER_FAILED,
      'Scene is invalid: it must expose window.renderAt(time) and set window.__sceneReady = true.',
      { details: pageErrors.join('\n') }
    );
  }
}
