/**
 * Timeline engine — audio is the master clock. Builds timeline.json v2.0.
 */
import { validateTimeline } from './validate.js';

/**
 * Build scene slots from alignments + narrative + importance.
 * One scene per aligned (or estimated) sentence by default — clear & Phase-3 ready.
 */
export function buildTimeline({
  jobId,
  audio,
  script,
  alignment,
  narrative,
  importance,
  pauses
}) {
  const duration = audio.durationSec;
  const alignMap = new Map((alignment?.alignments || []).map((a) => [a.sentenceId, a]));
  const scoreMap = new Map((importance?.scores || []).map((s) => [s.sentenceId, s]));
  const segments = (narrative?.segments || []).map((s) => ({
    id: s.id,
    type: s.type,
    start: s.start,
    end: s.end,
    confidence: s.confidence,
    sentenceIds: s.sentenceIds
  }));

  const sentenceToSeg = new Map();
  for (const seg of segments) {
    for (const sid of seg.sentenceIds || []) sentenceToSeg.set(sid, seg.id);
  }

  const scenes = [];
  const sentences = script.sentences || [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const a = alignMap.get(s.id);
    let start = a?.start;
    let end = a?.end;

    if (start == null || end == null) {
      // Fallback proportional
      start = (i / Math.max(1, sentences.length)) * duration;
      end = ((i + 1) / Math.max(1, sentences.length)) * duration;
    }

    start = Math.max(0, start);
    end = Math.min(duration, Math.max(start + 0.05, end));

    const score = scoreMap.get(s.id);
    const segmentId = sentenceToSeg.get(s.id) || null;
    const seg = segments.find((g) => g.id === segmentId);

    scenes.push({
      id: `SC${String(i + 1).padStart(3, '0')}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)),
      sourceSentenceIds: [s.id],
      segmentId,
      importance: score?.importance ?? 0.5,
      narration: {
        sentenceIds: [s.id],
        text: s.text
      },
      segment: seg ? { id: seg.id, type: seg.type } : null,
      visualIntent: {
        type: 'placeholder',
        description: 'Reserved for future storyboard generation'
      },
      render: {
        renderer: 'html-canvas',
        sceneModule: 'basic'
      }
    });
  }

  // Snap last scene end to duration; ensure contiguous coverage without overlaps
  if (scenes.length) {
    scenes.sort((a, b) => a.start - b.start);
    for (let i = 0; i < scenes.length - 1; i++) {
      if (scenes[i].end > scenes[i + 1].start) {
        scenes[i].end = scenes[i + 1].start;
        scenes[i].duration = Number((scenes[i].end - scenes[i].start).toFixed(3));
      }
      // Fill tiny gaps into previous scene end
      const gap = scenes[i + 1].start - scenes[i].end;
      if (gap > 0 && gap < 0.15) {
        scenes[i].end = scenes[i + 1].start;
        scenes[i].duration = Number((scenes[i].end - scenes[i].start).toFixed(3));
      }
    }
    scenes[scenes.length - 1].end = Number(duration.toFixed(3));
    scenes[scenes.length - 1].duration = Number(
      (scenes[scenes.length - 1].end - scenes[scenes.length - 1].start).toFixed(3)
    );
    // First scene starts at 0
    scenes[0].start = 0;
    scenes[0].duration = Number((scenes[0].end - scenes[0].start).toFixed(3));
  }

  const timeline = {
    version: '2.0',
    jobId,
    audio: {
      duration: Number(duration.toFixed(3)),
      masterClock: true,
      format: audio.format,
      codec: audio.codec
    },
    segments,
    scenes,
    pauses: (pauses?.pauses || []).map((p) => ({
      id: p.id,
      start: p.start,
      end: p.end,
      duration: p.duration,
      type: p.type
    })),
    hook: narrative?.hook || null,
    meta: {
      sentenceCount: sentences.length,
      sceneCount: scenes.length,
      segmentCount: segments.length,
      pauseCount: (pauses?.pauses || []).length,
      transcriptionEngine: null
    },
    validation: { valid: true, errors: [], warnings: [] }
  };

  timeline.validation = validateTimeline(timeline);
  return timeline;
}
