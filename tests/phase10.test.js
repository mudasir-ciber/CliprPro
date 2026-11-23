/**
 * Phase 10 production packaging tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  suggestTitles,
  buildChapters,
  buildDeliveryManifest,
  AI_DISCLOSURE,
  phaseStatusTable,
  readPackageVersion
} from '../src/package/manifest.js';
import { packageDelivery } from '../src/package/delivery.js';
import { tmpDir, hasFfmpeg, skipUnless, config } from './helpers.js';
import { run } from '../src/utils/exec.js';

test('readPackageVersion is semver 1.x', () => {
  assert.match(readPackageVersion(), /^1\.\d+\.\d+/);
});

test('phaseStatusTable marks all 10 complete', () => {
  const table = phaseStatusTable();
  assert.equal(table.length, 10);
  assert.ok(table.every((p) => p.status === 'complete'));
  assert.equal(table[9].phase, 10);
});

test('suggestTitles prefers hook + lead sentences', () => {
  const titles = suggestTitles({
    sentences: [
      { text: 'What if video could ship itself?' },
      { text: 'CliprPro turns scripts into frames.' },
      { text: 'Remember the takeaway.' }
    ]
  });
  assert.ok(titles.length >= 2);
  assert.ok(titles[0].includes('What if') || titles[0].length > 5);
});

test('buildChapters from timeline scenes', () => {
  const chapters = buildChapters({
    scenes: [
      { id: 'SC1', start: 0, end: 2, narration: { text: 'Hook line' }, segment: { type: 'hook' } },
      { id: 'SC2', start: 2, end: 5, narration: { text: 'Body' }, segment: { type: 'development' } }
    ]
  });
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].role, 'hook');
  assert.equal(chapters[0].start, 0);
});

test('buildDeliveryManifest includes disclosure and media', () => {
  const m = buildDeliveryManifest({
    jobId: 'job-test',
    script: { sentences: [{ text: 'Hello world from CliprPro today.' }] },
    timelineDoc: {
      scenes: [{ id: 'SC1', start: 0, end: 3, narration: { text: 'Hello' }, segment: { type: 'hook' } }]
    },
    storyboard: { planner: 'heuristic', summary: { moods: ['curious'] } },
    qc: { passed: true, summary: { errorCount: 0, warningCount: 1 } },
    repair: { attempted: false, success: true },
    verification: { videoCodec: 'h264', audioCodec: 'aac' },
    fps: 30,
    width: 1280,
    height: 720,
    durationSec: 3,
    outputPath: '/x/final.mp4',
    thumbnailPath: '/x/thumbnail.jpg',
    sceneName: 'storyboard'
  });
  assert.equal(m.version, '10.0');
  assert.equal(m.phase, 10);
  assert.equal(m.media.video, 'final.mp4');
  assert.ok(m.packaging.titles.length >= 1);
  assert.ok(m.packaging.description.includes(AI_DISCLOSURE) || m.packaging.disclosure === AI_DISCLOSURE);
  assert.equal(m.quality.qcPassed, true);
  assert.equal(m.packaging.chapters.length, 1);
});

test('packageDelivery writes handoff folder', async (t) => {
  const reason = skipUnless(hasFfmpeg, 'FFmpeg');
  if (reason) return t.skip(reason);

  const jobDir = tmpDir('p10-job-');
  const output = path.join(jobDir, 'output');
  const analysis = path.join(jobDir, 'analysis');
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(analysis, { recursive: true });

  // tiny silent mp4 via lavfi
  const finalPath = path.join(output, 'final.mp4');
  const r = await run(config.ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=320x180:d=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    finalPath
  ]);
  assert.equal(r.code, 0, r.stderr);

  const job = {
    id: 'job-p10',
    dir: jobDir,
    paths: { output, analysis, root: jobDir }
  };

  const delivery = await packageDelivery({
    job,
    script: { sentences: [{ text: 'Blue screen test clip for packaging.' }, { text: 'Second line.' }] },
    timelineDoc: {
      scenes: [
        { id: 'SC1', start: 0, end: 0.5, narration: { text: 'Open' }, segment: { type: 'hook' } },
        { id: 'SC2', start: 0.5, end: 1, narration: { text: 'Close' }, segment: { type: 'conclusion' } }
      ]
    },
    storyboard: { planner: 'heuristic', summary: { moods: ['calm'] } },
    qc: { passed: true, summary: { errorCount: 0, warningCount: 0 } },
    repair: { attempted: false },
    verification: { videoCodec: 'h264', audioCodec: 'aac' },
    fps: 30,
    width: 320,
    height: 180,
    durationSec: 1,
    finalPath,
    config,
    sceneName: 'basic'
  });

  assert.ok(fs.existsSync(delivery.paths.deliveryJson));
  assert.ok(fs.existsSync(path.join(jobDir, 'delivery', 'final.mp4')));
  assert.ok(fs.existsSync(path.join(jobDir, 'delivery', 'delivery.json')));
  assert.ok(fs.existsSync(path.join(jobDir, 'delivery', 'chapters.txt')));
  assert.ok(fs.existsSync(path.join(output, 'titles.txt')));
  assert.equal(delivery.packaging.chapters.length, 2);
});
