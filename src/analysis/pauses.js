/**
 * Pause detection from silence regions + gaps between aligned sentences.
 */
export function classifyPauseDuration(durationSec, thresholds) {
  const { shortMax = 0.4, mediumMax = 1.0 } = thresholds || {};
  if (durationSec < shortMax) return 'short-pause';
  if (durationSec < mediumMax) return 'medium-pause';
  return 'long-pause';
}

/**
 * @param {object} opts
 * @param {object} opts.audio - analyzeAudio result
 * @param {object} opts.alignment - alignScriptToTranscript result
 * @param {number} opts.durationSec
 * @param {object} [opts.thresholds]
 */
export function detectPauses({ audio, alignment, durationSec, thresholds }) {
  const cfg = {
    shortMax: thresholds?.shortMax ?? 0.4,
    mediumMax: thresholds?.mediumMax ?? 1.0,
    minGapSec: thresholds?.minGapSec ?? 0.2
  };

  const candidates = [];

  for (const r of audio?.silence?.regions || []) {
    if ((r.duration || 0) >= cfg.minGapSec) {
      candidates.push({
        start: r.start,
        end: r.end,
        duration: r.duration,
        origin: 'silence'
      });
    }
  }

  const timed = (alignment?.alignments || [])
    .filter((a) => a.start != null && a.end != null)
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < timed.length - 1; i++) {
    const gapStart = timed[i].end;
    const gapEnd = timed[i + 1].start;
    const duration = gapEnd - gapStart;
    if (duration >= cfg.minGapSec) {
      candidates.push({
        start: gapStart,
        end: gapEnd,
        duration,
        origin: 'sentence-gap',
        afterSentenceId: timed[i].sentenceId,
        beforeSentenceId: timed[i + 1].sentenceId
      });
    }
  }

  // Merge overlapping candidates
  candidates.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const c of candidates) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end + 0.05) {
      last.end = Math.max(last.end, c.end);
      last.duration = last.end - last.start;
      last.origin = last.origin === c.origin ? last.origin : 'mixed';
    } else {
      merged.push({ ...c });
    }
  }

  const pauses = merged
    .filter((p) => p.start >= 0 && p.end <= durationSec + 0.05 && p.duration >= cfg.minGapSec)
    .map((p, i) => ({
      id: `P${String(i + 1).padStart(3, '0')}`,
      start: Number(p.start.toFixed(3)),
      end: Number(Math.min(durationSec, p.end).toFixed(3)),
      duration: Number(Math.min(durationSec, p.end - p.start).toFixed(3)),
      type: classifyPauseDuration(p.duration, cfg),
      origin: p.origin,
      afterSentenceId: p.afterSentenceId || null,
      beforeSentenceId: p.beforeSentenceId || null
    }));

  return {
    version: '2.0',
    thresholds: cfg,
    pauses
  };
}
