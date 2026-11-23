/**
 * Deterministic frame renderer.
 *
 * One browser, one page, one scene load. For every frame we call
 * window.renderAt(time) and capture a PNG. No realtime clock is involved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlaywright } from './playwright.js';
import { resolveBrowserLaunch } from './browser.js';
import { needsHttpScene, startStaticServer } from './staticServer.js';
import { frameFileName, frameTime } from '../pipeline/timeline.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/**
 * @param {object} o
 * @param {string} o.sceneHtmlPath
 * @param {string} o.framesDir
 * @param {{totalFrames:number, fps:number, durationSec?:number}} o.timeline
 * @param {number} o.width
 * @param {number} o.height
 * @param {object} o.config      from getConfig()
 * @param {object} [o.logger]
 * @param {number} [o.maxFrames] render only the first N frames (testing)
 * @returns {Promise<{framesRendered:number, framesDir:string}>}
 */
export async function renderFrames({ sceneHtmlPath, framesDir, timeline, width, height, config, logger, maxFrames }) {
  const { chromium } = await loadPlaywright();
  const total = maxFrames ? Math.min(maxFrames, timeline.totalFrames) : timeline.totalFrames;
  const pageErrors = [];

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

  try {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // Chromium logs favicon / harmless 404s as console.error over http://
      if (/favicon\.ico/i.test(text)) return;
      if (/Failed to load resource:.*\b404\b/i.test(text) && !/\.(js|mjs|css|html|json|wasm)\b/i.test(text)) return;
      pageErrors.push(`console.error: ${text}`);
    });

    const html = fs.readFileSync(sceneHtmlPath, 'utf8');
    let sceneUrl = pathToFileURL(sceneHtmlPath).href;
    if (needsHttpScene(html)) {
      staticServer = await startStaticServer(path.dirname(sceneHtmlPath));
      sceneUrl = staticServer.urlFor(path.basename(sceneHtmlPath));
      logger?.info(`Scene served over HTTP :${staticServer.port}`);
    }

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
    logger?.info(`Scene loaded: ${path.basename(sceneHtmlPath)}`);
    logger?.info(`Rendering frames (${total} @ ${timeline.fps} fps, ${width}x${height})`);

    const step = Math.max(1, Math.floor(total / 10));
    for (let i = 0; i < total; i++) {
      const t = Math.min(frameTime(i, timeline.fps), timeline.durationSec);
      const file = path.join(framesDir, frameFileName(i));
      try {
        await page.evaluate((time) => window.renderAt(time), t);
      } catch (err) {
        throw new VideoGenError(ErrorCodes.SCENE_RENDER_FAILED, `Scene failed at t=${t.toFixed(3)}s (frame ${i + 1}): ${firstLine(err)}`, { cause: err, details: pageErrors.join('\n') });
      }
      if (pageErrors.length) {
        throw new VideoGenError(ErrorCodes.SCENE_RENDER_FAILED, `Scene reported a browser error at frame ${i + 1}: ${pageErrors[0]}`, { details: pageErrors.join('\n') });
      }
      try {
        await page.screenshot({ path: file, type: 'png' });
      } catch (err) {
        throw new VideoGenError(ErrorCodes.FRAME_CAPTURE_FAILED, `Could not capture frame ${i + 1}: ${firstLine(err)}`, { cause: err });
      }
      if ((i + 1) % step === 0 || i + 1 === total) {
        logger?.info(`Frames ${i + 1}/${total} (${Math.round(((i + 1) / total) * 100)}%)`);
      }
    }
    logger?.info('Frames completed');
    return { framesRendered: total, framesDir };
  } finally {
    await browser.close();
    if (staticServer) await staticServer.close();
  }
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
