/**
 * Extended audio analysis: FFprobe metadata + silence/pause regions via FFmpeg silencedetect.
 */
import { probeAudio } from '../audio/probe.js';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/**
 * Parse ffmpeg silencedetect stderr into silence regions.
 * @returns {Array<{start:number, end:number, duration:number}>}
 */
export function parseSilenceDetect(stderr) {
  const starts = [];
  const ends = [];
  const silenceStart = /silence_start:\s*([0-9.]+)/g;
  const silenceEnd = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;
  let m;
  while ((m = silenceStart.exec(stderr))) starts.push(Number(m[1]));
  while ((m = silenceEnd.exec(stderr))) ends.push({ end: Number(m[1]), duration: Number(m[2]) });

  const regions = [];
  const n = Math.min(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const start = starts[i];
    const end = ends[i].end;
    const duration = ends[i].duration ?? Math.max(0, end - start);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      regions.push({ start, end, duration });
    }
  }
  // Trailing silence with start but no end
  if (starts.length > ends.length) {
    const start = starts[ends.length];
    regions.push({ start, end: null, duration: null, open: true });
  }
  return regions;
}

/**
 * Detect silence using FFmpeg silencedetect filter.
 */
export async function detectSilence(audioPath, {
  ffmpegPath = 'ffmpeg',
  noiseDb = -30,
  minDurationSec = 0.25
} = {}) {
  let result;
  try {
    result = await run(ffmpegPath, [
      '-hide_banner',
      '-i', audioPath,
      '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      '-f', 'null',
      '-'
    ]);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new VideoGenError(ErrorCodes.FFMPEG_MISSING, 'FFmpeg not found while detecting silence.', { cause: err });
    }
    throw err;
  }
  // silencedetect writes to stderr; exit code is usually 0
  const regions = parseSilenceDetect(result.stderr || '');
  return regions.filter((r) => r.end != null);
}

/**
 * Full Phase 2 audio analysis artifact.
 */
export async function analyzeAudio(audioPath, {
  ffprobePath = 'ffprobe',
  ffmpegPath = 'ffmpeg',
  noiseDb = -30,
  minSilenceSec = 0.25
} = {}) {
  const meta = await probeAudio(audioPath, { ffprobePath });
  let silenceRegions = [];
  try {
    silenceRegions = await detectSilence(audioPath, {
      ffmpegPath,
      noiseDb,
      minDurationSec: minSilenceSec
    });
  } catch (err) {
    // Soft-fail silence: metadata still usable
    silenceRegions = [];
    if (err instanceof VideoGenError && err.code === ErrorCodes.FFMPEG_MISSING) throw err;
  }

  // Close open trailing silence against duration
  const duration = meta.durationSec;
  silenceRegions = silenceRegions.map((r) => {
    if (r.end == null) {
      return { start: r.start, end: duration, duration: Math.max(0, duration - r.start) };
    }
    return r;
  }).filter((r) => r.duration > 0 && r.start < duration);

  // Speech regions = inverse of silence within [0, duration]
  const speechRegions = [];
  let cursor = 0;
  for (const s of silenceRegions.sort((a, b) => a.start - b.start)) {
    if (s.start > cursor + 0.01) {
      speechRegions.push({ start: cursor, end: s.start, duration: s.start - cursor });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration - 0.01) {
    speechRegions.push({ start: cursor, end: duration, duration: duration - cursor });
  }
  if (!speechRegions.length && duration > 0) {
    speechRegions.push({ start: 0, end: duration, duration });
  }

  return {
    version: '2.0',
    source: 'voiceover',
    durationSec: duration,
    format: meta.format,
    codec: meta.codec,
    sampleRate: meta.sampleRate,
    channels: meta.channels,
    bitRate: meta.bitRate,
    sizeBytes: meta.sizeBytes,
    silence: {
      noiseDb,
      minDurationSec: minSilenceSec,
      regions: silenceRegions
    },
    speech: {
      regions: speechRegions
    },
    confidence: silenceRegions.length ? 0.85 : 0.6
  };
}
