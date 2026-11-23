/**
 * Optional local Whisper via @xenova/transformers.
 * Falls back with a clear error if the package/model is missing.
 * On success, returns word/segment timestamps when the model provides them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { VideoGenError, ErrorCodes } from '../../utils/errors.js';
import { transcribeEstimated } from './estimated.js';

async function loadPipeline() {
  let transformers;
  try {
    transformers = await import('@xenova/transformers');
  } catch (err) {
    throw new VideoGenError(
      ErrorCodes.TRANSCRIPTION_UNAVAILABLE,
      'Whisper engine requires @xenova/transformers. Run: npm install @xenova/transformers\n' +
        'Or set TRANSCRIPTION_ENGINE=estimated (default).',
      { cause: err }
    );
  }
  const model = process.env.WHISPER_MODEL || 'Xenova/whisper-tiny.en';
  return transformers.pipeline('automatic-speech-recognition', model);
}

/**
 * Convert audio to a path Whisper can read. Prefer wav; otherwise rely on transformers decode.
 */
export async function transcribeWhisper({ audioPath, language = 'en', script, audio }) {
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new VideoGenError(ErrorCodes.AUDIO_MISSING, `Audio not found for Whisper: ${audioPath}`);
  }

  let asr;
  try {
    asr = await loadPipeline();
  } catch (err) {
    throw err;
  }

  let result;
  try {
    result = await asr(audioPath, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      language: language === 'en' ? 'english' : language,
      task: 'transcribe'
    });
  } catch (err) {
    // Some builds only support segment timestamps
    try {
      result = await asr(audioPath, {
        return_timestamps: true,
        chunk_length_s: 30,
        language: language === 'en' ? 'english' : language,
        task: 'transcribe'
      });
    } catch (err2) {
      throw new VideoGenError(
        ErrorCodes.TRANSCRIPTION_FAILED,
        'Whisper failed to transcribe the voiceover.',
        { cause: err2, details: String(err2.message || err2) }
      );
    }
  }

  const duration = audio?.durationSec || 0;
  const chunks = result.chunks || [];
  const segments = [];

  if (chunks.length) {
    // Group words into segments (~sentence-sized) or use chunk as segment
    let segWords = [];
    let segStart = null;
    let segId = 1;

    const flush = () => {
      if (!segWords.length) return;
      const start = segWords[0].start;
      const end = segWords[segWords.length - 1].end;
      segments.push({
        id: `T${String(segId++).padStart(3, '0')}`,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: segWords.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(),
        words: segWords.map((w) => ({
          text: w.text,
          start: Number(w.start.toFixed(3)),
          end: Number(w.end.toFixed(3))
        })),
        timingSource: 'word'
      });
      segWords = [];
      segStart = null;
    };

    for (const c of chunks) {
      const text = String(c.text || '').trim();
      if (!text) continue;
      const ts = c.timestamp || [0, 0];
      const start = Number(ts[0] ?? 0);
      const end = Number(ts[1] ?? start);
      // If chunk looks like a full phrase (has spaces), treat as segment
      if (text.includes(' ') && (end - start) > 0.4) {
        flush();
        segments.push({
          id: `T${String(segId++).padStart(3, '0')}`,
          start: Number(start.toFixed(3)),
          end: Number(end.toFixed(3)),
          text,
          words: text.split(/\s+/).map((t, i, arr) => {
            const ws = start + ((end - start) * i) / arr.length;
            const we = start + ((end - start) * (i + 1)) / arr.length;
            return { text: t, start: Number(ws.toFixed(3)), end: Number(we.toFixed(3)) };
          }),
          timingSource: 'segment'
        });
        continue;
      }
      if (segStart == null) segStart = start;
      segWords.push({ text: text.replace(/^\s+/, ''), start, end: end || start + 0.2 });
      const last = text.slice(-1);
      if (/[.!?]/.test(last) || segWords.length >= 18) flush();
    }
    flush();
  } else if (result.text) {
    // No timestamps — fall back to estimated timing using Whisper text + script structure
    const estimated = await transcribeEstimated({
      script: {
        ...script,
        sentences: script.sentences?.length
          ? script.sentences
          : [{ id: 'S001', index: 0, text: result.text, wordCount: result.text.split(/\s+/).length, charCount: result.text.length }]
      },
      audio,
      language
    });
    return {
      ...estimated,
      engine: 'whisper',
      engineVersion: process.env.WHISPER_MODEL || 'Xenova/whisper-tiny.en',
      rawText: result.text,
      notes: 'Whisper returned text without reliable timestamps; timing estimated from speech regions.',
      segments: estimated.segments.map((s) => ({ ...s, timingSource: 'estimated' }))
    };
  }

  return {
    source: 'voiceover',
    engine: 'whisper',
    engineVersion: process.env.WHISPER_MODEL || 'Xenova/whisper-tiny.en',
    language,
    duration,
    segments,
    rawText: result.text || segments.map((s) => s.text).join(' '),
    notes: path.basename(audioPath)
  };
}
