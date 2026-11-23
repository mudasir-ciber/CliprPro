/**
 * Estimated transcription engine (local, no model download).
 * Distributes script sentences across speech regions by word weight.
 * Timing provenance is clearly marked as "estimated".
 */
import { tokenize } from '../normalize.js';

/**
 * @param {object} opts
 * @param {object} opts.script - parseScript() result
 * @param {object} opts.audio - analyzeAudio() result
 * @param {string} [opts.language]
 */
export async function transcribeEstimated({ script, audio, language = 'en' }) {
  const sentences = script.sentences || [];
  const duration = audio.durationSec;
  const speechRegions = (audio.speech?.regions || []).filter((r) => r.duration > 0);
  const regions = speechRegions.length
    ? speechRegions
    : [{ start: 0, end: duration, duration }];

  const totalWords = Math.max(1, sentences.reduce((n, s) => n + Math.max(1, s.wordCount), 0));
  const totalSpeech = regions.reduce((n, r) => n + r.duration, 0) || duration;

  // Build a continuous speech timeline (concat speech regions)
  const speechTimeline = [];
  for (const r of regions) {
    speechTimeline.push({ ...r });
  }

  function speechOffsetToTime(offsetSec) {
    let rem = offsetSec;
    for (const r of speechTimeline) {
      if (rem <= r.duration) return r.start + rem;
      rem -= r.duration;
    }
    return duration;
  }

  const segments = [];
  let wordCursor = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const words = Math.max(1, s.wordCount);
    const startOffset = (wordCursor / totalWords) * totalSpeech;
    wordCursor += words;
    const endOffset = (wordCursor / totalWords) * totalSpeech;
    const start = speechOffsetToTime(startOffset);
    const end = Math.max(start + 0.05, speechOffsetToTime(endOffset));

    const tokens = tokenize(s.text);
    const span = Math.max(0.05, end - start);
    const wordObjs = tokens.map((t, wi) => {
      const ws = start + (wi / Math.max(1, tokens.length)) * span;
      const we = start + ((wi + 1) / Math.max(1, tokens.length)) * span;
      return { text: t, start: Number(ws.toFixed(3)), end: Number(we.toFixed(3)) };
    });

    segments.push({
      id: `T${String(i + 1).padStart(3, '0')}`,
      start: Number(start.toFixed(3)),
      end: Number(Math.min(duration, end).toFixed(3)),
      text: s.text,
      words: wordObjs,
      timingSource: 'estimated',
      scriptSentenceId: s.id
    });
  }

  // If no sentences, one empty-ish segment covering full duration
  if (!segments.length && duration > 0) {
    segments.push({
      id: 'T001',
      start: 0,
      end: duration,
      text: '',
      words: [],
      timingSource: 'estimated'
    });
  }

  return {
    source: 'voiceover',
    engine: 'estimated',
    engineVersion: '2.0',
    language,
    duration,
    segments,
    notes: 'Timing estimated from script word weights mapped onto detected speech regions. Not a speech-to-text transcript.'
  };
}
