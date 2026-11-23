/**
 * Phase 7 visual QC tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PNG } from './png-lite.js';
import { analyzeRgb24, hashBuffer, pickSampleIndices } from '../src/qc/stats.js';
import { runVisualQc } from '../src/qc/runQc.js';
import { VideoGenError, ErrorCodes } from '../src/utils/errors.js';
import { frameFileName } from '../src/pipeline/timeline.js';
import { tmpDir, hasFfmpeg, skipUnless, config } from './helpers.js';

test('pickSampleIndices covers endpoints', () => {
  assert.deepEqual(pickSampleIndices(1, 24), [0]);
  const s = pickSampleIndices(100, 5);
  assert.equal(s[0], 0);
  assert.equal(s[s.length - 1], 99);
  assert.equal(s.length, 5);
});

test('analyzeRgb24 detects black and colorful frames', () => {
  const black = Buffer.alloc(160 * 90 * 3, 0);
  const b = analyzeRgb24(black, { blackLuma: 12, lowVar: 40 });
  assert.equal(b.nearBlack, true);
  assert.equal(b.lowVariance, true);

  const colorful = Buffer.alloc(160 * 90 * 3);
  for (let i = 0; i < colorful.length; i += 3) {
    colorful[i] = (i * 17) % 256;
    colorful[i + 1] = (i * 31) % 256;
    colorful[i + 2] = (i * 53) % 256;
  }
  const c = analyzeRgb24(colorful, { blackLuma: 12, lowVar: 40 });
  assert.equal(c.nearBlack, false);
  assert.ok(c.variance > 40);
});

test('hashBuffer is stable', () => {
  const a = Buffer.from([1, 2, 3, 4]);
  assert.equal(hashBuffer(a), hashBuffer(a));
  assert.notEqual(hashBuffer(a), hashBuffer(Buffer.from([1, 2, 3, 5])));
});

test('runVisualQc passes on healthy synthetic frames', async (t) => {
  const reason = skipUnless(hasFfmpeg, 'FFmpeg/FFprobe');
  if (reason) return t.skip(reason);

  const framesDir = tmpDir('p7-ok-');
  const outDir = tmpDir('p7-out-');
  const total = 6;
  for (let i = 0; i < total; i++) {
    const png = PNG.solid(64, 36, [40 + i * 20, 80, 160 - i * 10]);
    fs.writeFileSync(path.join(framesDir, frameFileName(i)), png);
  }
  const qc = await runVisualQc({
    framesDir,
    timeline: { totalFrames: total, fps: 2 },
    width: 64,
    height: 36,
    config: { ...config, qcContactSheet: false, qcFailOnError: true },
    outDir
  });
  assert.equal(qc.passed, true);
  assert.equal(qc.summary.errorCount, 0);
  assert.ok(fs.existsSync(path.join(outDir, 'qc.json')));
  assert.equal(qc.version, '7.0');
});

test('runVisualQc fails on missing frames', async (t) => {
  const reason = skipUnless(hasFfmpeg, 'FFmpeg/FFprobe');
  if (reason) return t.skip(reason);

  const framesDir = tmpDir('p7-miss-');
  const outDir = tmpDir('p7-miss-out-');
  // only write frame 0 of 4
  fs.writeFileSync(path.join(framesDir, frameFileName(0)), PNG.solid(64, 36, [20, 40, 80]));
  await assert.rejects(
    () =>
      runVisualQc({
        framesDir,
        timeline: { totalFrames: 4, fps: 2 },
        width: 64,
        height: 36,
        config: { ...config, qcContactSheet: false, qcFailOnError: true },
        outDir
      }),
    (err) => err instanceof VideoGenError && err.code === ErrorCodes.QC_FAILED
  );
  assert.ok(fs.existsSync(path.join(outDir, 'qc.json')));
});

test('runVisualQc flags all-black frames as error', async (t) => {
  const reason = skipUnless(hasFfmpeg, 'FFmpeg/FFprobe');
  if (reason) return t.skip(reason);

  const framesDir = tmpDir('p7-blk-');
  const outDir = tmpDir('p7-blk-out-');
  const total = 4;
  for (let i = 0; i < total; i++) {
    fs.writeFileSync(path.join(framesDir, frameFileName(i)), PNG.solid(64, 36, [0, 0, 0]));
  }
  await assert.rejects(
    () =>
      runVisualQc({
        framesDir,
        timeline: { totalFrames: total, fps: 2 },
        width: 64,
        height: 36,
        config: { ...config, qcContactSheet: false, qcFailOnError: true, qcBlackLuma: 12 },
        outDir
      }),
    (err) => err instanceof VideoGenError && err.code === ErrorCodes.QC_FAILED
  );
});
