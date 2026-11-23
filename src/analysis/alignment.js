/**
 * Sequence-aware script ↔ transcript alignment (Phase 2).
 */
import { tokenSimilarity, tokenize } from './normalize.js';

/**
 * Needleman–Wunsch style alignment on sentence/segment sequences using token similarity.
 *
 * @param {object} opts
 * @param {Array} opts.sentences - script sentences
 * @param {Array} opts.segments - transcript segments
 * @param {number} [opts.threshold=0.45]
 */
export function alignScriptToTranscript({ sentences, segments, threshold = 0.45 }) {
  const S = sentences || [];
  const T = segments || [];
  const n = S.length;
  const m = T.length;

  if (!n) {
    return {
      version: '2.0',
      threshold,
      alignments: [],
      unmatchedSentences: [],
      unmatchedTranscriptIds: T.map((t) => t.id),
      stats: { aligned: 0, partial: 0, unmatched: 0 }
    };
  }

  // If transcript was estimated from the same script, prefer identity mapping
  const identity = T.length === n && T.every((t, i) => t.scriptSentenceId === S[i].id || tokenSimilarity(t.text, S[i].text) >= 0.9);
  if (identity) {
    const alignments = S.map((s, i) => ({
      sentenceId: s.id,
      transcriptSegmentIds: [T[i].id],
      start: T[i].start,
      end: T[i].end,
      confidence: 0.99,
      status: 'aligned',
      timingSource: T[i].timingSource || 'estimated',
      similarity: 1
    }));
    return {
      version: '2.0',
      threshold,
      alignments,
      unmatchedSentences: [],
      unmatchedTranscriptIds: [],
      stats: { aligned: alignments.length, partial: 0, unmatched: 0 }
    };
  }

  // DP: maximize sum of similarities; gap penalty
  const GAP = -0.15;
  const score = (i, j) => tokenSimilarity(S[i].text, T[j].text);
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + GAP;
    bt[i][0] = 'up';
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + GAP;
    bt[0][j] = 'left';
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + score(i - 1, j - 1);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      if (diag >= up && diag >= left) {
        dp[i][j] = diag;
        bt[i][j] = 'diag';
      } else if (up >= left) {
        dp[i][j] = up;
        bt[i][j] = 'up';
      } else {
        dp[i][j] = left;
        bt[i][j] = 'left';
      }
    }
  }

  // Backtrack → pairs
  const pairs = []; // {si, tj} or null gaps
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === 'diag') {
      pairs.push({ si: i - 1, tj: j - 1 });
      i--;
      j--;
    } else if (dir === 'up') {
      pairs.push({ si: i - 1, tj: null });
      i--;
    } else if (dir === 'left') {
      pairs.push({ si: null, tj: j - 1 });
      j--;
    } else break;
  }
  pairs.reverse();

  // Merge consecutive transcript hits for same sentence (left gaps after a match)
  const bySentence = new Map();
  const usedT = new Set();
  const unmatchedTranscriptIds = [];

  for (const p of pairs) {
    if (p.si == null && p.tj != null) {
      unmatchedTranscriptIds.push(T[p.tj].id);
      continue;
    }
    if (p.si != null && p.tj == null) {
      if (!bySentence.has(p.si)) bySentence.set(p.si, { tjs: [], sims: [] });
      continue;
    }
    const sim = score(p.si, p.tj);
    if (!bySentence.has(p.si)) bySentence.set(p.si, { tjs: [], sims: [] });
    if (sim >= threshold * 0.5) {
      bySentence.get(p.si).tjs.push(p.tj);
      bySentence.get(p.si).sims.push(sim);
      usedT.add(p.tj);
    }
  }

  // Attach leftover unmatched transcript that wasn't used
  for (let tj = 0; tj < m; tj++) {
    if (!usedT.has(tj) && !unmatchedTranscriptIds.includes(T[tj].id)) {
      // keep only those marked as left gaps already; ignore if weakly related
    }
  }

  const alignments = [];
  const unmatchedSentences = [];
  let aligned = 0;
  let partial = 0;
  let unmatched = 0;

  for (let si = 0; si < n; si++) {
    const entry = bySentence.get(si) || { tjs: [], sims: [] };
    const s = S[si];
    if (!entry.tjs.length) {
      unmatchedSentences.push(s.id);
      unmatched++;
      alignments.push({
        sentenceId: s.id,
        transcriptSegmentIds: [],
        start: null,
        end: null,
        confidence: 0,
        status: 'unmatched',
        timingSource: 'none',
        similarity: 0
      });
      continue;
    }
    const segs = entry.tjs.map((tj) => T[tj]).sort((a, b) => a.start - b.start);
    const sim = entry.sims.reduce((a, b) => a + b, 0) / entry.sims.length;
    const status = sim >= threshold ? 'aligned' : 'partial';
    if (status === 'aligned') aligned++;
    else partial++;
    alignments.push({
      sentenceId: s.id,
      transcriptSegmentIds: segs.map((g) => g.id),
      start: segs[0].start,
      end: segs[segs.length - 1].end,
      confidence: Number(Math.min(0.99, sim).toFixed(3)),
      status,
      timingSource: segs[0].timingSource || 'segment',
      similarity: Number(sim.toFixed(3))
    });
  }

  // Fill timing for unmatched via interpolation between neighbors
  for (let i = 0; i < alignments.length; i++) {
    const a = alignments[i];
    if (a.start != null) continue;
    let prev = null;
    let next = null;
    for (let p = i - 1; p >= 0; p--) if (alignments[p].end != null) { prev = alignments[p]; break; }
    for (let q = i + 1; q < alignments.length; q++) if (alignments[q].start != null) { next = alignments[q]; break; }
    const start = prev ? prev.end : 0;
    const end = next ? next.start : (T[T.length - 1]?.end ?? start);
    if (end > start) {
      a.start = Number(start.toFixed(3));
      a.end = Number(end.toFixed(3));
      a.timingSource = 'interpolated';
      a.status = a.status === 'unmatched' ? 'estimated' : a.status;
      a.confidence = Math.max(a.confidence, 0.35);
    }
  }

  return {
    version: '2.0',
    threshold,
    alignments,
    unmatchedSentences,
    unmatchedTranscriptIds: unmatchedTranscriptIds.filter((id) => !alignments.some((a) => a.transcriptSegmentIds.includes(id))),
    stats: { aligned, partial, unmatched }
  };
}

/** Convenience: word-count helper for tests. */
export function alignmentCoverage(alignment) {
  const total = alignment.alignments.length || 1;
  const ok = alignment.alignments.filter((a) => a.status === 'aligned' || a.status === 'partial' || a.status === 'estimated').length;
  return ok / total;
}
