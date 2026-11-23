// Test 3: duration calculation, Test 4: frame count calculation
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotalFrames, frameTime, frameFileName, createTimeline } from '../src/pipeline/timeline.js';

test('frame count: 10 s @ 30 fps = 300 frames', () => {
  assert.equal(calculateTotalFrames(10, 30), 300);
});

test('frame count: 42.73 s @ 30 fps rounds up to 1282', () => {
  assert.equal(calculateTotalFrames(42.73, 30), 1282);
});

test('frame count: float noise does not add an extra frame', () => {
  assert.equal(calculateTotalFrames(10.0000001, 30), 300);
});

test('frame count: other FPS values and tiny durations', () => {
  assert.equal(calculateTotalFrames(2, 60), 120);
  assert.equal(calculateTotalFrames(0.001, 30), 1);
});

test('frame count: invalid input throws', () => {
  assert.throws(() => calculateTotalFrames(0, 30), { code: 'INVALID_DURATION' });
  assert.throws(() => calculateTotalFrames(NaN, 30), { code: 'INVALID_DURATION' });
  assert.throws(() => calculateTotalFrames(5, 0), { code: 'INVALID_CONFIG' });
});

test('frameTime and frameFileName', () => {
  assert.equal(frameTime(0, 30), 0);
  assert.ok(Math.abs(frameTime(3, 30) - 0.1) < 1e-12);
  assert.equal(frameFileName(0), 'frame_000001.png');
  assert.equal(frameFileName(299), 'frame_000300.png');
});

test('createTimeline keeps audio duration as master', () => {
  const tl = createTimeline({ durationSec: 42.73, fps: 30 });
  assert.equal(tl.durationSec, 42.73);
  assert.equal(tl.totalFrames, 1282);
});
