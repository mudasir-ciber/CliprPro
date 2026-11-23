/**
 * Deterministic importance scoring (0..1) with explainable factors.
 */
import { rhetoricalBoost } from './narrative.js';
import { tokenize } from './normalize.js';

const ENTITY = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|\d+%|\$\d+|\d{4})\b/;
const FILLER = /\b(um|uh|you know|basically|actually|literally|sort of|kind of)\b/i;

/**
 * @param {object} opts
 * @param {Array} opts.sentences
 * @param {object} opts.alignment
 * @param {object} opts.narrative
 * @param {object} opts.pauses
 * @param {number} opts.durationSec
 */
export function scoreImportance({ sentences, alignment, narrative, pauses, durationSec }) {
  const alignMap = new Map((alignment?.alignments || []).map((a) => [a.sentenceId, a]));
  const roleMap = new Map((narrative?.sentenceRoles || []).map((r) => [r.sentenceId, r]));
  const n = Math.max(1, sentences.length);

  const roleWeight = {
    hook: 0.9,
    setup: 0.55,
    development: 0.5,
    escalation: 0.7,
    climax: 0.95,
    resolution: 0.65,
    conclusion: 0.8
  };

  const scores = sentences.map((s, i) => {
    const pos = n <= 1 ? 0 : i / (n - 1);
    // Opening + closing boost; middle lower unless markers say otherwise
    const position = pos < 0.12 ? 0.85 : pos > 0.88 ? 0.75 : 0.35 + 0.2 * Math.sin(pos * Math.PI);

    const rhetoric = rhetoricalBoost(s.text);
    const words = tokenize(s.text);
    const entity = ENTITY.test(s.text) ? 0.7 : words.some((w) => /^[A-Z]/.test(w)) ? 0.35 : 0.1;
    // Length: slight preference for medium sentences, not long dumps
    const lenFactor = words.length <= 4 ? 0.35 : words.length <= 18 ? 0.65 : words.length <= 30 ? 0.45 : 0.25;
    const fillerPenalty = FILLER.test(s.text) ? 0.25 : 0;

    const role = roleMap.get(s.id)?.type || 'development';
    const narrativeFactor = roleWeight[role] ?? 0.5;

    const a = alignMap.get(s.id);
    let timing = 0.4;
    if (a?.start != null && a?.end != null) {
      const dur = a.end - a.start;
      // Emphasized if followed/preceded by a long pause
      const nearPause = (pauses?.pauses || []).some(
        (p) => p.type === 'long-pause' && (Math.abs(p.start - a.end) < 0.35 || Math.abs(p.end - a.start) < 0.35)
      );
      timing = Math.min(1, 0.35 + Math.min(dur / 8, 0.4) + (nearPause ? 0.25 : 0));
    }

    const factors = {
      position: Number(position.toFixed(3)),
      rhetorical: Number(rhetoric.toFixed(3)),
      entity: Number(entity.toFixed(3)),
      narrative: Number(narrativeFactor.toFixed(3)),
      timing: Number(timing.toFixed(3)),
      length: Number(lenFactor.toFixed(3)),
      fillerPenalty: Number(fillerPenalty.toFixed(3))
    };

    // Weighted blend
    let importance =
      factors.position * 0.15 +
      factors.rhetorical * 0.2 +
      factors.entity * 0.15 +
      factors.narrative * 0.25 +
      factors.timing * 0.15 +
      factors.length * 0.1 -
      factors.fillerPenalty;

    importance = Math.max(0, Math.min(1, importance));

    return {
      sentenceId: s.id,
      importance: Number(importance.toFixed(3)),
      factors,
      role
    };
  });

  return {
    version: '2.0',
    method: 'deterministic-heuristic',
    scores
  };
}
