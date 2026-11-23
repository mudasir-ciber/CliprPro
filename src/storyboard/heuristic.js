/**
 * Deterministic heuristic storyboard planner (Phases 3–4).
 * Maps narrative role + importance + text cues → visualIntent (incl. advanced 2D).
 */
import { normalizeVisualIntent, paletteFor } from './schema.js';
import { ROLE_VISUAL_2D } from '../visuals2d/presets.js';

const ROLE_DEFAULTS = {
  hook: { mood: 'curious', layout: 'title-hero', motion: 'impact', zoom: 1.08 },
  setup: { mood: 'calm', layout: 'split-focus', motion: 'rise', zoom: 1.0 },
  development: { mood: 'calm', layout: 'center-focus', motion: 'sweep', zoom: 1.02 },
  escalation: { mood: 'urgent', layout: 'kinetic', motion: 'pulse', zoom: 1.06 },
  climax: { mood: 'intense', layout: 'callout', motion: 'impact', zoom: 1.12 },
  resolution: { mood: 'reflective', layout: 'center-focus', motion: 'fade', zoom: 1.0 },
  conclusion: { mood: 'triumphant', layout: 'closing', motion: 'orbit', zoom: 0.98 }
};

const KEYWORD_MOOD = [
  [/what if|imagine|secret|shock/i, 'curious'],
  [/warning|stop|never|urgent|now/i, 'urgent'],
  [/finally|breakthrough|reveal|suddenly/i, 'intense'],
  [/remember|takeaway|lesson|thank/i, 'triumphant'],
  [/calm|quietly|slow|gentle/i, 'calm']
];

function pickEmphasis(text) {
  const words = String(text || '')
    .replace(/[^A-Za-z0-9\s%-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const scored = words.map((w) => ({
    w,
    score: (/^[A-Z]/.test(w) ? 2 : 0) + (w.length > 7 ? 1 : 0) + (/\d|%/.test(w) ? 2 : 0)
  }));
  scored.sort((a, b) => b.score - a.score || b.w.length - a.w.length);
  const uniq = [];
  for (const s of scored) {
    const low = s.w.toLowerCase();
    if (!uniq.some((u) => u.toLowerCase() === low)) uniq.push(s.w);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

function moodFromText(text, fallback) {
  for (const [re, mood] of KEYWORD_MOOD) {
    if (re.test(text)) return mood;
  }
  return fallback;
}

function visualPrompt({ role, mood, layout, motif, text, emphasis }) {
  const focus = emphasis.length ? emphasis.join(', ') : 'the core idea';
  return `${role} shot, ${mood} mood, ${layout} + ${motif} motif. Narration: "${String(text).slice(0, 110)}". Emphasize: ${focus}.`;
}

/**
 * @param {object} opts
 * @param {object} opts.timeline
 * @param {object} [opts.script]
 */
export function planStoryboardHeuristic({ timeline, script }) {
  const sentenceMap = new Map((script?.sentences || []).map((s) => [s.id, s]));
  const shots = [];

  for (const scene of timeline.scenes || []) {
    const role = scene.segment?.type || 'development';
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.development;
    const v2d = ROLE_VISUAL_2D[role] || ROLE_VISUAL_2D.development;
    const text = scene.narration?.text || sentenceMap.get(scene.sourceSentenceIds?.[0])?.text || '';
    const importance = scene.importance ?? 0.5;
    const emphasis = pickEmphasis(text);
    const mood = moodFromText(text, defaults.mood);
    const layout = importance >= 0.75 && role !== 'hook' ? 'callout' : defaults.layout;
    const motion = importance >= 0.8 ? 'impact' : defaults.motion;
    const zoom = defaults.zoom + (importance - 0.5) * 0.08;
    const motif = importance >= 0.85 && role === 'climax' ? 'rings' : v2d.motif;
    const transition = importance >= 0.8 ? 'zoom-punch' : v2d.transition;

    const visualIntent = normalizeVisualIntent(
      {
        mood,
        layout,
        motion,
        motif,
        transition,
        typography: v2d.typography,
        fx: v2d.fx,
        palette: paletteFor(mood),
        emphasis,
        visualPrompt: visualPrompt({ role, mood, layout, motif, text, emphasis }),
        camera: { zoom: Number(zoom.toFixed(3)), panX: 0, panY: role === 'hook' ? -0.02 : 0 },
        elements: [
          { kind: 'badge', label: String(role).toUpperCase() },
          { kind: 'accent-orb', strength: importance },
          { kind: 'motif', name: motif },
          ...(emphasis[0] ? [{ kind: 'keyword', text: emphasis[0] }] : [])
        ],
        confidence: 0.55 + Math.min(0.35, importance * 0.35),
        planner: 'heuristic'
      },
      { ...defaults, ...v2d }
    );

    shots.push({
      id: `SHOT-${scene.id}`,
      sceneId: scene.id,
      start: scene.start,
      end: scene.end,
      duration: scene.duration,
      segmentType: role,
      narrationText: text,
      importance,
      visualIntent
    });
  }

  return {
    version: '4.0',
    planner: 'heuristic',
    plannerVersion: '4.0.0',
    jobId: timeline.jobId || null,
    generatedAt: new Date().toISOString(),
    phase: 4,
    shots,
    summary: {
      shotCount: shots.length,
      moods: [...new Set(shots.map((s) => s.visualIntent.mood))],
      layouts: [...new Set(shots.map((s) => s.visualIntent.layout))],
      motifs: [...new Set(shots.map((s) => s.visualIntent.motif))],
      transitions: [...new Set(shots.map((s) => s.visualIntent.transition))]
    }
  };
}
