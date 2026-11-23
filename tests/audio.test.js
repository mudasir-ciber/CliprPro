// Test 2: audio metadata extraction
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { probeAudio } from '../src/audio/probe.js';
import { tmpDir, makeAudio, hasFfmpeg, skipUnless, config } from './helpers.js';

const skip = skipUnless(hasFfmpeg, 'ffmpeg/ffprobe');
const dir = tmpDir();

test('probeAudio: WAV stereo 44.1 kHz', { skip }, async () => {
  const f = await makeAudio(path.join(dir, 'a.wav'), { durationSec: 2.5, sampleRate: 44100, channels: 2 });
  const m = await probeAudio(f, { ffprobePath: config.ffprobePath });
  assert.ok(Math.abs(m.durationSec - 2.5) < 0.05, `duration ${m.durationSec}`);
  assert.equal(m.format, 'wav');
  assert.equal(m.sampleRate, 44100);
  assert.equal(m.channels, 2);
});

test('probeAudio: WAV mono 48 kHz', { skip }, async () => {
  const f = await makeAudio(path.join(dir, 'b.wav'), { durationSec: 1, sampleRate: 48000, channels: 1 });
  const m = await probeAudio(f, { ffprobePath: config.ffprobePath });
  assert.equal(m.sampleRate, 48000);
  assert.equal(m.channels, 1);
});

test('probeAudio: MP3', { skip }, async (t) => {
  let f;
  try {
    f = await makeAudio(path.join(dir, 'c.mp3'), { durationSec: 2 });
  } catch {
    return t.skip('this FFmpeg build has no MP3 encoder');
  }
  const m = await probeAudio(f, { ffprobePath: config.ffprobePath });
  assert.equal(m.format, 'mp3');
  assert.ok(Math.abs(m.durationSec - 2) < 0.2);
});

test('probeAudio: M4A (AAC)', { skip }, async () => {
  const f = await makeAudio(path.join(dir, 'd.m4a'), { durationSec: 2 });
  const m = await probeAudio(f, { ffprobePath: config.ffprobePath });
  assert.equal(m.codec, 'aac');
  assert.equal(m.format, 'm4a');
});

test('probeAudio: missing ffprobe -> FFPROBE_MISSING with clean message', async () => {
  await assert.rejects(probeAudio('x.wav', { ffprobePath: 'definitely-not-ffprobe-xyz' }), (err) => {
    assert.equal(err.code, 'FFPROBE_MISSING');
    assert.match(err.message, /FFmpeg/);
    return true;
  });
});
