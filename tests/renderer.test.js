// Test 6: renderAt(time) availability + determinism, Test 7: basic rendering pipeline
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateScene } from '../src/scenes/index.js';
import { createTimeline, frameFileName } from '../src/pipeline/timeline.js';
import { renderFrames } from '../src/renderer/renderer.js';
import { loadPlaywright } from '../src/renderer/playwright.js';
import { resolveBrowserLaunch } from '../src/renderer/browser.js';
import { tmpDir, hasBrowser, skipUnless, config } from './helpers.js';

const skip = skipUnless(hasBrowser, 'Chromium/Playwright');
const W = 320, H = 180;

function makeScene(durationSec = 4) {
  return generateScene('basic', { sceneDir: tmpDir(), title: 'Test', subtitle: 'Sub', durationSec, fps: 30, width: W, height: H });
}

test('renderAt(time) exists and is deterministic', { skip }, async () => {
  const scene = makeScene(10);
  const { chromium } = await loadPlaywright();
  const launch = await resolveBrowserLaunch(config);
  const launchOpts = {
    headless: true,
    args: config.chromiumNoSandbox ? ['--no-sandbox'] : []
  };
  if (launch.executablePath) launchOpts.executablePath = launch.executablePath;
  else if (launch.channel) launchOpts.channel = launch.channel;
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(scene.sceneHtmlPath).href);

    const info = await page.evaluate(() => ({ fn: typeof window.renderAt, ready: window.__sceneReady, meta: window.__scene }));
    assert.equal(info.fn, 'function');
    assert.equal(info.ready, true);
    assert.equal(info.meta.durationSec, 10);

    const snap = (t) =>
      page.evaluate((time) => {
        window.renderAt(time);
        return document.getElementById('stage').toDataURL();
      }, t);

    const a1 = await snap(5.0);
    await snap(1.0); // jump backwards in time
    await snap(9.0);
    const a2 = await snap(5.0);
    assert.equal(a1, a2, 'same time must produce identical pixels regardless of call order');
    assert.notEqual(a1, await snap(6.0), 'different times must differ');
    assert.notEqual(await snap(0.0), await snap(3.0));

    await assert.rejects(page.evaluate(() => window.renderAt('abc')), /finite number/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('renderFrames writes correctly numbered PNG frames', { skip }, async () => {
  const durationSec = 1;
  const timeline = createTimeline({ durationSec, fps: 30 });
  assert.equal(timeline.totalFrames, 30);
  const scene = makeScene(durationSec);
  const framesDir = tmpDir('ocvg-frames-');

  const r = await renderFrames({ sceneHtmlPath: scene.sceneHtmlPath, framesDir, timeline, width: W, height: H, config });
  assert.equal(r.framesRendered, 30);

  const files = fs.readdirSync(framesDir).sort();
  assert.equal(files.length, 30);
  assert.equal(files[0], 'frame_000001.png');
  assert.equal(files[29], 'frame_000030.png');
  for (let i = 0; i < 30; i++) assert.equal(files[i], frameFileName(i));

  const first = fs.readFileSync(path.join(framesDir, files[0]));
  const last = fs.readFileSync(path.join(framesDir, files[29]));
  assert.deepEqual([...first.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  assert.ok(first.length > 500 && last.length > 500);
  assert.notDeepEqual(first, last, 'first and last frame must differ');
});

test('renderFrames: broken scene -> SCENE_RENDER_FAILED', { skip }, async () => {
  const dir = tmpDir();
  const bad = path.join(dir, 'bad.html');
  fs.writeFileSync(bad, '<html><body><script>window.__sceneReady = true;</script></body></html>');
  const timeline = createTimeline({ durationSec: 1, fps: 30 });
  await assert.rejects(
    renderFrames({ sceneHtmlPath: bad, framesDir: tmpDir(), timeline, width: W, height: H, config }),
    { code: 'SCENE_RENDER_FAILED' }
  );
});
