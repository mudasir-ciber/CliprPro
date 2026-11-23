/**
 * Phase 5 Three.js / WebGL scene tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { generateScene, listScenes } from '../src/scenes/index.js';
import { planStoryboardHeuristic } from '../src/storyboard/heuristic.js';
import { applyStoryboardToTimeline } from '../src/storyboard/apply.js';
import { parseScript } from '../src/analysis/scriptParser.js';
import { buildTimeline } from '../src/timeline/engine.js';
import { alignScriptToTranscript } from '../src/analysis/alignment.js';
import { detectPauses } from '../src/analysis/pauses.js';
import { segmentNarrative } from '../src/analysis/narrative.js';
import { scoreImportance } from '../src/analysis/importance.js';
import { transcribeEstimated } from '../src/analysis/transcription/estimated.js';
import { createTimeline } from '../src/pipeline/timeline.js';
import { renderFrames } from '../src/renderer/renderer.js';
import { tmpDir, hasBrowser, skipUnless, config } from './helpers.js';

async function miniBundle() {
  const script = parseScript('What if 3D could sync to voice?\nSuddenly the reveal fills the frame.\nRemember this takeaway.');
  const audio = {
    durationSec: 3,
    format: 'wav',
    codec: 'pcm_s16le',
    speech: { regions: [{ start: 0, end: 3, duration: 3 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({ sentences: script.sentences, segments: transcript.segments });
  const pauses = detectPauses({ audio, alignment, durationSec: 3 });
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 3 });
  const importance = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses, durationSec: 3 });
  const timeline = buildTimeline({ jobId: 'p5', audio, script, alignment, narrative, importance, pauses });
  const storyboard = planStoryboardHeuristic({ timeline, script });
  const applied = applyStoryboardToTimeline(timeline, storyboard);
  return { script, timeline: applied.timeline, storyboard };
}

test('scene registry includes threejs', () => {
  assert.ok(listScenes().includes('threejs'));
});

test('generateThreejsScene copies vendor three module', async () => {
  const { timeline, storyboard } = await miniBundle();
  const scene = generateScene('threejs', {
    sceneDir: tmpDir('p5-scene-'),
    title: '3D',
    durationSec: 3,
    fps: 30,
    width: 640,
    height: 360,
    timeline,
    storyboard
  });
  assert.equal(scene.name, 'threejs');
  assert.ok(fs.existsSync(scene.sceneHtmlPath));
  assert.ok(fs.existsSync(path.join(path.dirname(scene.sceneHtmlPath), 'vendor', 'three.module.js')));
  const html = fs.readFileSync(scene.sceneHtmlPath, 'utf8');
  assert.ok(html.includes('import * as THREE'));
  assert.ok(html.includes('window.renderAt'));
  assert.ok(html.includes('__sceneReady'));
  assert.ok(!html.includes('__SCENE_CONFIG__'));
});

test('threejs scene source avoids wall-clock APIs', () => {
  const src = fs.readFileSync(path.join('src', 'scenes', 'threejs', 'scene.template.html'), 'utf8');
  for (const bad of ['Date.now', 'Math.random', 'requestAnimationFrame', 'performance.now', 'setTimeout', 'setInterval']) {
    assert.ok(!src.includes(bad), `must not use ${bad}`);
  }
});

test('renderFrames threejs produces PNGs', async (t) => {
  const reason = skipUnless(hasBrowser, 'Chromium/Chrome');
  if (reason) return t.skip(reason);

  const { timeline, storyboard } = await miniBundle();
  // compress to 1s for speed
  const shortScenes = timeline.scenes.slice(0, 2).map((s, i) => ({
    ...s,
    start: i * 0.5,
    end: (i + 1) * 0.5,
    duration: 0.5
  }));
  const shortTl = { ...timeline, scenes: shortScenes, audio: { ...timeline.audio, duration: 1 } };
  const shortSb = {
    ...storyboard,
    shots: storyboard.shots.slice(0, 2).map((sh, i) => ({ ...sh, start: i * 0.5, end: (i + 1) * 0.5, duration: 0.5 }))
  };
  const scene = generateScene('threejs', {
    sceneDir: tmpDir('p5-render-'),
    title: '3D',
    durationSec: 1,
    fps: 10,
    width: 320,
    height: 180,
    timeline: shortTl,
    storyboard: shortSb
  });
  const framesDir = tmpDir('p5-frames-');
  const ft = createTimeline({ durationSec: 1, fps: 10 });
  const r = await renderFrames({
    sceneHtmlPath: scene.sceneHtmlPath,
    framesDir,
    timeline: ft,
    width: 320,
    height: 180,
    config
  });
  assert.equal(r.framesRendered, 10);
  assert.ok(fs.existsSync(path.join(framesDir, 'frame_000001.png')));
  assert.ok(fs.statSync(path.join(framesDir, 'frame_000001.png')).size > 500);
});
