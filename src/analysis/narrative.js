/**
 * Deterministic heuristic narrative segmentation (NOT AI storyboard / Phase 3).
 */
import { normalizeText } from './normalize.js';

const HOOK_MARKERS = /\b(what if|imagine|did you know|secret|shocking|never|always|warning|stop|listen|here'?s why|the truth)\b|[?!]/i;
const CLIMAX_MARKERS = /\b(finally|suddenly|then|reveal|realized|turned out|climax|moment|decision|breakthrough)\b/i;
const RESOLUTION_MARKERS = /\b(in the end|eventually|as a result|therefore|so we|that'?s why)\b/i;
const CONCLUSION_MARKERS = /\b(in conclusion|to sum up|remember|takeaway|lesson|next time|thank you|that'?s it)\b/i;
const SETUP_MARKERS = /\b(once|ago|began|started|background|context|first|initially)\b/i;

function rhetoricalBoost(text) {
  let score = 0;
  if (HOOK_MARKERS.test(text)) score += 0.35;
  if (CLIMAX_MARKERS.test(text)) score += 0.25;
  if (RESOLUTION_MARKERS.test(text)) score += 0.2;
  if (CONCLUSION_MARKERS.test(text)) score += 0.3;
  if (SETUP_MARKERS.test(text)) score += 0.15;
  if (/[?]/.test(text)) score += 0.15;
  return Math.min(1, score);
}

/**
 * @param {object} opts
 * @param {Array} opts.sentences
 * @param {object} opts.alignment
 * @param {number} opts.durationSec
 * @param {number} [opts.hookWindowSec=15]
 */
export function segmentNarrative({ sentences, alignment, durationSec, hookWindowSec = 15 }) {
  const alignMap = new Map((alignment?.alignments || []).map((a) => [a.sentenceId, a]));
  const n = sentences.length || 1;

  const enriched = sentences.map((s, i) => {
    const a = alignMap.get(s.id);
    const start = a?.start ?? (i / n) * durationSec;
    const end = a?.end ?? ((i + 1) / n) * durationSec;
    const pos = n <= 1 ? 0 : i / (n - 1);
    return {
      sentence: s,
      start,
      end,
      pos,
      rhetoric: rhetoricalBoost(s.text),
      inHookWindow: start < hookWindowSec
    };
  });

  // Assign coarse roles by position + markers
  function roleFor(e, i) {
    if (CONCLUSION_MARKERS.test(e.sentence.text) || e.pos >= 0.9) return 'conclusion';
    if (RESOLUTION_MARKERS.test(e.sentence.text) || (e.pos >= 0.75 && e.pos < 0.9)) return 'resolution';
    if (CLIMAX_MARKERS.test(e.sentence.text) || (e.pos >= 0.55 && e.pos < 0.75)) return 'climax';
    if (e.pos >= 0.3 && e.pos < 0.55) return e.rhetoric > 0.2 ? 'escalation' : 'development';
    if (SETUP_MARKERS.test(e.sentence.text) || (e.pos >= 0.12 && e.pos < 0.3)) return 'setup';
    if (e.inHookWindow && (i === 0 || HOOK_MARKERS.test(e.sentence.text) || e.rhetoric > 0.2)) return 'hook';
    if (e.pos < 0.12) return 'hook';
    return 'development';
  }

  const typed = enriched.map((e, i) => ({ ...e, type: roleFor(e, i) }));

  // Merge consecutive same-type into segments
  const segments = [];
  let cur = null;
  for (const e of typed) {
    if (!cur || cur.type !== e.type) {
      if (cur) segments.push(cur);
      cur = {
        id: null,
        type: e.type,
        start: e.start,
        end: e.end,
        sentenceIds: [e.sentence.id],
        confidence: 0.55 + e.rhetoric * 0.3
      };
    } else {
      cur.end = e.end;
      cur.sentenceIds.push(e.sentence.id);
      cur.confidence = Math.min(0.92, cur.confidence + 0.02);
    }
  }
  if (cur) segments.push(cur);

  // Ensure hook exists for early content
  if (segments.length && segments[0].type !== 'hook' && segments[0].start < hookWindowSec) {
    // split first segment if long enough
    const first = segments[0];
    const cut = Math.min(hookWindowSec, first.start + (first.end - first.start) * 0.4);
    if (cut > first.start + 0.3 && cut < first.end - 0.3 && first.sentenceIds.length > 1) {
      const mid = Math.max(1, Math.ceil(first.sentenceIds.length * 0.35));
      const hookIds = first.sentenceIds.slice(0, mid);
      const restIds = first.sentenceIds.slice(mid);
      const hookEnd = typed.find((t) => t.sentence.id === hookIds[hookIds.length - 1])?.end ?? cut;
      segments.splice(0, 1,
        {
          id: null,
          type: 'hook',
          start: first.start,
          end: hookEnd,
          sentenceIds: hookIds,
          confidence: 0.7
        },
        {
          id: null,
          type: first.type,
          start: hookEnd,
          end: first.end,
          sentenceIds: restIds,
          confidence: first.confidence
        }
      );
    } else {
      first.type = 'hook';
      first.confidence = Math.max(first.confidence, 0.65);
    }
  }

  segments.forEach((s, i) => {
    s.id = `SEG${String(i + 1).padStart(3, '0')}`;
    s.start = Number(Math.max(0, s.start).toFixed(3));
    s.end = Number(Math.min(durationSec, Math.max(s.start + 0.05, s.end)).toFixed(3));
    s.confidence = Number(s.confidence.toFixed(3));
    s.method = 'heuristic';
  });

  // Hook detection summary
  const hookSeg = segments.find((s) => s.type === 'hook');
  const hook = hookSeg
    ? {
        present: true,
        segmentId: hookSeg.id,
        start: hookSeg.start,
        end: hookSeg.end,
        windowSec: hookWindowSec,
        confidence: hookSeg.confidence,
        sentenceIds: hookSeg.sentenceIds
      }
    : { present: false, windowSec: hookWindowSec, confidence: 0, sentenceIds: [] };

  return {
    version: '2.0',
    method: 'heuristic',
    hookWindowSec,
    hook,
    segments,
    sentenceRoles: typed.map((e) => ({
      sentenceId: e.sentence.id,
      type: e.type,
      rhetoric: Number(e.rhetoric.toFixed(3))
    }))
  };
}

export { rhetoricalBoost, normalizeText };
