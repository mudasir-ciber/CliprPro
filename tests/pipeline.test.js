// Test 8: full pipeline -> final MP4 with original voiceover
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateVideo } from '../src/pipeline/generateVideo.js';
import { ffprobeJson } from '../src/audio/probe.js';
import { createLogger } from '../src/utils/logger.js';
import { tmpDir, makeAudio, hasFfmpeg, hasBrowser, skipUnless, config } from './helpers.js';

const skip = skipUnless(hasFfmpeg && hasBrowser, 'FFmpeg + Chromium');

test('pipeline: script + voiceover -> playable final.mp4', { skip }, async () => {
  const dir = tmpDir();
  const script = path.join(dir, 'script.txt');
  fs.writeFileSync(script, 'Pipeline Test\nEnd to end\n');
  const audio = await makeAudio(path.join(dir, 'voiceover.wav'), { durationSec: 2, sampleRate: 48000, channels: 2 });
  const jobsDir = path.join(dir, 'jobs');

  const r = await generateVideo({ scriptPath: script, audioPath: audio, jobsDir, resolution: '640x360', fps: 30, logger: createLogger({ silent: true }) });

  // job structure
  assert.match(r.jobId, /^job-\d{8}-001$/);
  for (const sub of ['input', 'audio', 'scenes', 'frames', 'output', 'logs']) {
    assert.ok(fs.existsSync(path.join(r.jobDir, sub)), `${sub}/ missing`);
  }
  assert.equal(path.basename(r.outputPath), 'final.mp4');
  assert.ok(fs.existsSync(r.outputPath));
  assert.ok(!fs.existsSync(path.join(r.jobDir, 'output', 'video_silent.mp4')), 'temporary silent video should be removed');

  // frame count = ceil(2 * 30) = 60
  assert.equal(fs.readdirSync(path.join(r.jobDir, 'frames')).length, 60);

  // metadata
  const meta = JSON.parse(fs.readFileSync(path.join(r.jobDir, 'metadata.json'), 'utf8'));
  assert.equal(meta.status, 'completed');
  assert.equal(meta.fps, 30);
  assert.deepEqual(meta.resolution, { width: 640, height: 360 });
  assert.ok(Math.abs(meta.audioDurationSec - 2) < 0.05);
  assert.equal(meta.jobId, r.jobId);

  // final MP4 content
  const info = await ffprobeJson(r.outputPath, config.ffprobePath);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.width, 640);
  assert.equal(v.height, 360);
  assert.equal(Number(v.nb_frames), 60);
  assert.ok(a, 'audio stream must exist');
  assert.equal(a.codec_name, 'aac');
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.1, `duration ${info.format.duration}`);
  assert.ok(Number(a.duration) >= 1.95, `audio must not be truncated, got ${a.duration}s`);

  // log file
  assert.match(fs.readFileSync(path.join(r.jobDir, 'logs', 'pipeline.log'), 'utf8'), /Final video created/);
});

test('pipeline: bad input fails cleanly and creates no job folder', { skip }, async () => {
  const dir = tmpDir();
  const jobsDir = path.join(dir, 'jobs');
  await assert.rejects(
    generateVideo({ scriptPath: path.join(dir, 'missing.txt'), audioPath: path.join(dir, 'missing.mp3'), jobsDir, logger: createLogger({ silent: true }) }),
    { code: 'SCRIPT_MISSING' }
  );
  assert.ok(!fs.existsSync(jobsDir) || fs.readdirSync(jobsDir).length === 0);
});

test('pipeline: failure after job creation marks metadata as failed', { skip }, async () => {
  const dir = tmpDir();
  const script = path.join(dir, 'script.txt');
  fs.writeFileSync(script, 'T\n');
  const audio = await makeAudio(path.join(dir, 'v.wav'), { durationSec: 1 });
  const jobsDir = path.join(dir, 'jobs');
  await assert.rejects(
    generateVideo({ scriptPath: script, audioPath: audio, jobsDir, ffmpegPath: undefined, sceneName: 'does-not-exist', logger: createLogger({ silent: true }) }),
    { code: 'SCENE_GENERATION_FAILED' }
  );
  const [jobId] = fs.readdirSync(jobsDir);
  const meta = JSON.parse(fs.readFileSync(path.join(jobsDir, jobId, 'metadata.json'), 'utf8'));
  assert.equal(meta.status, 'failed');
  assert.equal(meta.error.code, 'SCENE_GENERATION_FAILED');
});

test('config: invalid FPS / resolution are rejected', async () => {
  const { getConfig } = await import('../src/config.js');
  assert.throws(() => getConfig({ fps: 0 }), { code: 'INVALID_CONFIG' });
  assert.throws(() => getConfig({ fps: 500 }), { code: 'INVALID_CONFIG' });
  assert.throws(() => getConfig({ resolution: 'big' }), { code: 'INVALID_CONFIG' });
  assert.throws(() => getConfig({ resolution: '1921x1080' }), { code: 'INVALID_CONFIG' });
  assert.equal(getConfig({ resolution: '1280x720' }).width, 1280);
});
