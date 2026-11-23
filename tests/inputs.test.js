// Test 1: input validation
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateScript, validateAudioFile, validateInputs, deriveTitles } from '../src/pipeline/validateInputs.js';
import { tmpDir, makeAudio, hasFfmpeg, skipUnless, config } from './helpers.js';

const dir = tmpDir();
const script = path.join(dir, 'script.txt');
fs.writeFileSync(script, '# My Title\nMy subtitle\nBody text.\n');

test('validateScript: missing script -> SCRIPT_MISSING', () => {
  assert.throws(() => validateScript(path.join(dir, 'nope.txt')), { code: 'SCRIPT_MISSING' });
  assert.throws(() => validateScript(undefined), { code: 'SCRIPT_MISSING' });
});

test('validateScript: empty script -> SCRIPT_EMPTY', () => {
  const empty = path.join(dir, 'empty.txt');
  fs.writeFileSync(empty, '  \n\n');
  assert.throws(() => validateScript(empty), { code: 'SCRIPT_EMPTY' });
});

test('validateScript: valid script gives title and subtitle', () => {
  const s = validateScript(script);
  assert.equal(s.title, 'My Title');
  assert.equal(s.subtitle, 'My subtitle');
});

test('deriveTitles: handles single line and long lines', () => {
  assert.deepEqual(deriveTitles('Only one line'), { title: 'Only one line', subtitle: null });
  assert.ok(deriveTitles('x'.repeat(200)).title.length <= 80);
});

test('validateAudioFile: missing -> AUDIO_MISSING', () => {
  assert.throws(() => validateAudioFile(path.join(dir, 'nope.mp3')), { code: 'AUDIO_MISSING' });
  assert.throws(() => validateAudioFile(undefined), { code: 'AUDIO_MISSING' });
});

test('validateAudioFile: unsupported extension -> AUDIO_UNSUPPORTED_FORMAT', () => {
  const ogg = path.join(dir, 'a.ogg');
  fs.writeFileSync(ogg, 'x');
  assert.throws(() => validateAudioFile(ogg), { code: 'AUDIO_UNSUPPORTED_FORMAT' });
});

test('validateAudioFile: empty file -> AUDIO_INVALID', () => {
  const f = path.join(dir, 'empty.mp3');
  fs.writeFileSync(f, '');
  assert.throws(() => validateAudioFile(f), { code: 'AUDIO_INVALID' });
});

test('validateInputs: corrupted audio -> AUDIO_INVALID', { skip: skipUnless(hasFfmpeg, 'ffprobe') }, async () => {
  const bad = path.join(dir, 'bad.wav');
  fs.writeFileSync(bad, 'this is not audio at all');
  await assert.rejects(validateInputs({ scriptPath: script, audioPath: bad, ffprobePath: config.ffprobePath }), { code: 'AUDIO_INVALID' });
});

test('validateInputs: valid inputs succeed', { skip: skipUnless(hasFfmpeg, 'ffmpeg') }, async () => {
  const wav = await makeAudio(path.join(dir, 'ok.wav'), { durationSec: 1 });
  const r = await validateInputs({ scriptPath: script, audioPath: wav, ffprobePath: config.ffprobePath });
  assert.equal(r.script.title, 'My Title');
  assert.ok(r.audio.durationSec > 0.9);
});
