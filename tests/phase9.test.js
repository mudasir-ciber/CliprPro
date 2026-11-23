/**
 * Phase 9 long-form render tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { planChunks, resolveWorkerCount, missingFrameIndices, pendingChunks } from '../src/renderer/chunks.js';
import { frameFileName, createTimeline } from '../src/pipeline/timeline.js';
import { generateScene } from '../src/scenes/index.js';
import { renderFrames } from '../src/renderer/renderer.js';
import { PNG } from './png-lite.js';
import { tmpDir, hasBrowser, skipUnless, config } from './helpers.js';

test('planChunks covers full range without gaps/overlap', () => {
  const chunks = planChunks(100, 30);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks[chunks.length - 1].end, 100);
  let covered = 0;
  for (const c of chunks) {
    assert.ok(c.end > c.start);
    covered += c.end - c.start;
  }
  assert.equal(covered, 100);
});

test('resolveWorkerCount auto-bumps on long jobs', () => {
  assert.equal(resolveWorkerCount(30, { renderWorkers: 1, longFormAuto: true, longFormMinFrames: 120 }), 1);
  assert.equal(
    resolveWorkerCount(200, { renderWorkers: 1, longFormAuto: true, longFormMinFrames: 120, longFormWorkers: 2 }),
    2
  );
  assert.equal(
    resolveWorkerCount(200, { renderWorkers: 4, longFormAuto: true, longFormMinFrames: 120, longFormWorkers: 2 }),
    4
  );
  assert.equal(resolveWorkerCount(200, { renderWorkers: 1, longFormAuto: false }), 1);
});

test('pendingChunks keeps only missing indices', () => {
  const chunks = planChunks(10, 5);
  const missing = new Set([1, 2, 7]);
  const pending = pendingChunks(chunks, missing);
  assert.equal(pending.length, 2);
  assert.deepEqual(pending[0].indices, [1, 2]);
  assert.deepEqual(pending[1].indices, [7]);
});

test('missingFrameIndices detects gaps', () => {
  const dir = tmpDir('p9-miss-');
  fs.writeFileSync(path.join(dir, frameFileName(0)), PNG.solid(8, 8, [10, 20, 30]));
  const miss = missingFrameIndices(dir, 3, 64);
  assert.deepEqual(miss, [1, 2]);
});

test('renderFrames resumes by skipping existing PNGs', async (t) => {
  const reason = skipUnless(hasBrowser, 'Chromium/Playwright');
  if (reason) return t.skip(reason);

  const durationSec = 1;
  const timeline = createTimeline({ durationSec, fps: 10 });
  assert.equal(timeline.totalFrames, 10);
  const scene = generateScene('basic', {
    sceneDir: tmpDir('p9-scene-'),
    title: 'LF',
    durationSec,
    fps: 10,
    width: 320,
    height: 180
  });
  const framesDir = tmpDir('p9-frames-');
  const analysisDir = tmpDir('p9-analysis-');

  // Pre-seed first 4 frames
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(framesDir, frameFileName(i)), PNG.solid(320, 180, [40, 80, 120]));
  }

  const r = await renderFrames({
    sceneHtmlPath: scene.sceneHtmlPath,
    framesDir,
    timeline,
    width: 320,
    height: 180,
    config: { ...config, renderWorkers: 2, renderChunkSize: 3, renderResume: true, longFormAuto: false },
    analysisDir
  });
  assert.equal(r.framesRendered, 10);
  assert.equal(r.framesSkipped, 4);
  assert.ok(r.framesWritten >= 6);
  assert.ok(fs.existsSync(path.join(analysisDir, 'render.json')));
  assert.equal(fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length, 10);
});

test('renderFrames with workers=2 writes full sequence', async (t) => {
  const reason = skipUnless(hasBrowser, 'Chromium/Playwright');
  if (reason) return t.skip(reason);

  const durationSec = 0.5;
  const timeline = createTimeline({ durationSec, fps: 10 });
  const scene = generateScene('basic', {
    sceneDir: tmpDir('p9-par-scene-'),
    title: 'P',
    durationSec,
    fps: 10,
    width: 320,
    height: 180
  });
  const framesDir = tmpDir('p9-par-frames-');
  const analysisDir = tmpDir('p9-par-analysis-');
  const r = await renderFrames({
    sceneHtmlPath: scene.sceneHtmlPath,
    framesDir,
    timeline,
    width: 320,
    height: 180,
    config: { ...config, renderWorkers: 2, renderChunkSize: 2, renderResume: false, longFormAuto: false },
    analysisDir
  });
  assert.equal(r.framesRendered, timeline.totalFrames);
  assert.equal(r.workers, 2);
  assert.ok(fs.existsSync(path.join(analysisDir, 'render.json')));
});
