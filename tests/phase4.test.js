/**
 * Phase 4 advanced 2D visual tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { MOTIFS, TRANSITIONS, TYPE_STYLES, ROLE_VISUAL_2D } from '../src/visuals2d/presets.js';
import { normalizeVisualIntent } from '../src/storyboard/schema.js';
import { planStoryboardHeuristic } from '../src/storyboard/heuristic.js';
import { parseScript } from '../src/analysis/scriptParser.js';
import { buildTimeline } from '../src/timeline/engine.js';
import { alignScriptToTranscript } from '../src/analysis/alignment.js';
import { detectPauses } from '../src/analysis/pauses.js';
import { segmentNarrative } from '../src/analysis/narrative.js';
import { scoreImportance } from '../src/analysis/importance.js';
import { transcribeEstimated } from '../src/analysis/transcription/estimated.js';

test('Phase 4 presets are non-empty and consistent', () => {
  assert.ok(MOTIFS.length >= 6);
  assert.ok(TRANSITIONS.length >= 4);
  assert.ok(TYPE_STYLES.includes('bold-impact'));
  assert.equal(ROLE_VISUAL_2D.hook.motif, 'aurora');
});

test('normalizeVisualIntent includes advanced 2D fields', () => {
  const intent = normalizeVisualIntent({
    mood: 'urgent',
    layout: 'kinetic',
    motif: 'bars',
    transition: 'glitch-snap',
    typography: 'mono-tech',
    fx: ['glow', 'scan', 'nope']
  });
  assert.ok(['4.0', '6.0'].includes(intent.version));
  assert.equal(intent.motif, 'bars');
  assert.equal(intent.transition, 'glitch-snap');
  assert.equal(intent.typography, 'mono-tech');
  assert.deepEqual(intent.fx, ['glow', 'scan']);
});

test('heuristic assigns role-based motifs and transitions', async () => {
  const script = parseScript('What if this hooks you?\nSuddenly the climax hits hard.\nRemember the takeaway.');
  const audio = {
    durationSec: 6,
    format: 'wav',
    codec: 'pcm_s16le',
    speech: { regions: [{ start: 0, end: 6, duration: 6 }] },
    silence: { regions: [] }
  };
  const transcript = await transcribeEstimated({ script, audio });
  const alignment = alignScriptToTranscript({ sentences: script.sentences, segments: transcript.segments });
  const pauses = detectPauses({ audio, alignment, durationSec: 6 });
  const narrative = segmentNarrative({ sentences: script.sentences, alignment, durationSec: 6 });
  const importance = scoreImportance({ sentences: script.sentences, alignment, narrative, pauses, durationSec: 6 });
  const timeline = buildTimeline({ jobId: 'p4', audio, script, alignment, narrative, importance, pauses });
  const sb = planStoryboardHeuristic({ timeline, script });
  assert.ok(sb.phase >= 4);
  assert.ok(sb.summary.motifs.length >= 1);
  assert.ok(sb.summary.transitions.length >= 1);
  assert.ok(sb.shots.every((s) => MOTIFS.includes(s.visualIntent.motif)));
  assert.ok(sb.shots.every((s) => TRANSITIONS.includes(s.visualIntent.transition)));
});

test('storyboard Phase 4 scene avoids non-deterministic APIs', () => {
  const src = fs.readFileSync(path.join('src', 'scenes', 'storyboard', 'scene.template.html'), 'utf8');
  assert.ok(src.includes('Phase 4'));
  assert.ok(src.includes('drawMotif'));
  for (const bad of ['Date.now', 'Math.random', 'requestAnimationFrame', 'performance.now', 'setTimeout', 'setInterval']) {
    assert.ok(!src.includes(bad), `must not use ${bad}`);
  }
});
