/**
 * Phase 3 storyboard unit + integration tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseScript } from '../src/analysis/scriptParser.js';
import { planStoryboardHeuristic } from '../src/storyboard/heuristic.js';
import { applyStoryboardToTimeline } from '../src/storyboard/apply.js';
import { validateStoryboard, normalizeVisualIntent, MOODS } from '../src/storyboard/schema.js';
import { planStoryboard } from '../src/storyboard/index.js';
import { generateScene } from '../src/scenes/index.js';
import { buildTimeline } from '../src/timeline/engine.js';
import { alignScriptToTranscript } from '../src/analysis/alignment.js';
import { detectPauses } from '../src/analysis/pauses.js';
import { segmentNarrative } from '../src/analysis/narrative.js';
import { scoreImportance } from '../src/analysis/importance.js';
import { transcribeEstimated } from '../src/analysis/transcription/estimated.js';
import { tmpDir, hasBrowser, skipUnless, config } from './helpers.js';
import { createTimeline } from '../src/pipeline/timeline.js';
import { renderFrames } from '../src/renderer/renderer.js';

async function miniTimeline() {
  const script = parseScript(
    'What if stories could move?\nWe set the stage carefully.\nSuddenly the reveal arrives.\nRemember this takeaway.'
  );
  const audio = {
    durationSec: 8,
    format: 'wav',
    codec: 'pcm_s16le',
    speech: { regions: [{ start: 0, end: 8, duration: 8 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({ sentences: script.sentences, segments: transcript.segments });
  const pauses = detectPauses({ audio, alignment, durationSec: 8 });
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 8 });
  const importance = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses, durationSec: 8 });
  const timeline = buildTimeline({ jobId: 'job-p3', audio, script, alignment, narrative, importance, pauses });
  return { script, timeline };
}

test('normalizeVisualIntent fills Phase 3 contract', () => {
  const intent = normalizeVisualIntent({ mood: 'intense', layout: 'callout', motion: 'impact', emphasis: ['Reveal'] });
  assert.equal(intent.type, 'storyboard');
  assert.ok(['3.0', '4.0'].includes(intent.version));
  assert.equal(intent.mood, 'intense');
  assert.ok(intent.palette.accent);
  assert.ok(intent.motif);
  assert.ok(intent.transition);
  assert.ok(MOODS.includes(intent.mood));
});

test('heuristic storyboard plans one shot per scene', async () => {
  const { script, timeline } = await miniTimeline();
  const sb = planStoryboardHeuristic({ timeline, script });
  assert.ok(['3.0', '4.0'].includes(sb.version));
  assert.equal(sb.planner, 'heuristic');
  assert.equal(sb.shots.length, timeline.scenes.length);
  assert.ok(sb.shots.every((s) => s.visualIntent.type === 'storyboard'));
  assert.ok(sb.shots.every((s) => s.visualIntent.motif && s.visualIntent.typography));
  assert.ok(sb.shots[0].visualIntent.visualPrompt.length > 10);
  const v = validateStoryboard(sb);
  assert.equal(v.valid, true);
});

test('applyStoryboardToTimeline replaces placeholders', async () => {
  const { script, timeline } = await miniTimeline();
  assert.equal(timeline.scenes[0].visualIntent.type, 'placeholder');
  const sb = planStoryboardHeuristic({ timeline, script });
  const { timeline: next } = applyStoryboardToTimeline(timeline, sb);
  assert.equal(next.scenes[0].visualIntent.type, 'storyboard');
  assert.equal(next.scenes[0].render.sceneModule, 'storyboard');
  assert.ok(next.storyboard.shotCount > 0);
  assert.equal(next.validation.valid, true);
});

test('planStoryboard heuristic via abstraction', async () => {
  const { script, timeline } = await miniTimeline();
  const sb = await planStoryboard({ timeline, script, config: {}, planner: 'heuristic' });
  assert.equal(sb.planner, 'heuristic');
});

test('generateStoryboardScene embeds shot intents', async () => {
  const { script, timeline } = await miniTimeline();
  const sb = planStoryboardHeuristic({ timeline, script });
  const { timeline: next } = applyStoryboardToTimeline(timeline, sb);
  const scene = generateScene('storyboard', {
    sceneDir: tmpDir('p3-scene-'),
    title: 'T',
    subtitle: 'S',
    durationSec: 8,
    fps: 30,
    width: 640,
    height: 360,
    timeline: next,
    storyboard: sb
  });
  assert.equal(scene.name, 'storyboard');
  assert.ok(fs.existsSync(scene.sceneHtmlPath));
  const html = fs.readFileSync(scene.sceneHtmlPath, 'utf8');
  assert.ok(html.includes('window.renderAt'));
  assert.ok(html.includes('storyboard'));
  assert.ok(!html.includes('__SCENE_CONFIG__'));
  assert.ok(scene.config.shots.length === sb.shots.length);
  assert.ok(scene.config.shots[0].visualIntent.mood);
});

test('storyboard scene source avoids non-deterministic APIs', () => {
  const src = fs.readFileSync(path.join('src', 'scenes', 'storyboard', 'scene.template.html'), 'utf8');
  for (const bad of ['Date.now', 'Math.random', 'requestAnimationFrame', 'performance.now', 'setTimeout', 'setInterval']) {
    assert.ok(!src.includes(bad), `storyboard scene must not use ${bad}`);
  }
});

test('renderFrames storyboard scene is deterministic', async (t) => {
  const reason = skipUnless(hasBrowser, 'Chromium/Chrome');
  if (reason) return t.skip(reason);

  const { script, timeline } = await miniTimeline();
  const sb = planStoryboardHeuristic({ timeline, script });
  const { timeline: next } = applyStoryboardToTimeline(timeline, sb);
  const shortScenes = next.scenes.slice(0, 2).map((s, i) => ({
    ...s,
    start: i * 0.5,
    end: (i + 1) * 0.5,
    duration: 0.5
  }));
  const shortTl = { ...next, scenes: shortScenes, audio: { ...next.audio, duration: 1 } };
  const shortSb = { ...sb, shots: sb.shots.slice(0, 2).map((sh, i) => ({ ...sh, start: i * 0.5, end: (i + 1) * 0.5, duration: 0.5 })) };
  const scene2 = generateScene('storyboard', {
    sceneDir: tmpDir('p3-render2-'),
    title: 'T',
    durationSec: 1,
    fps: 10,
    width: 320,
    height: 180,
    timeline: shortTl,
    storyboard: shortSb
  });

  const framesDir = tmpDir('p3-frames-');
  const ft = createTimeline({ durationSec: 1, fps: 10 });
  const r = await renderFrames({
    sceneHtmlPath: scene2.sceneHtmlPath,
    framesDir,
    timeline: ft,
    width: 320,
    height: 180,
    config
  });
  assert.equal(r.framesRendered, 10);
  assert.ok(fs.existsSync(path.join(framesDir, 'frame_000001.png')));
});
