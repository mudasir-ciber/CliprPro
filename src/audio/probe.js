/**
 * FFprobe helpers. ffprobe is the single source of truth for audio metadata.
 */
import path from 'node:path';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/** Run ffprobe and return its parsed JSON (format + streams). */
export async function ffprobeJson(filePath, ffprobePath = 'ffprobe') {
  let result;
  try {
    result = await run(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new VideoGenError(
        ErrorCodes.FFPROBE_MISSING,
        'FFprobe not found. Please install FFmpeg (it includes ffprobe) and add it to PATH.',
        { cause: err }
      );
    }
    throw err;
  }
  if (result.code !== 0) {
    throw new VideoGenError(ErrorCodes.AUDIO_INVALID, `FFprobe could not read "${path.basename(filePath)}". The file may be corrupted.`, {
      details: result.stderr
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new VideoGenError(ErrorCodes.AUDIO_INVALID, 'FFprobe returned unreadable output.', { details: result.stdout, cause: err });
  }
}

function friendlyFormat(formatName = '', filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const names = formatName.split(',');
  if (names.includes('mp4') || names.includes('mov')) return ext || 'mp4';
  return names[0] || ext;
}

/**
 * Extract audio metadata.
 * @returns {Promise<{durationSec:number, format:string, codec:string, sampleRate:number, channels:number, bitRate:number|null, sizeBytes:number}>}
 */
export async function probeAudio(filePath, { ffprobePath = 'ffprobe' } = {}) {
  const info = await ffprobeJson(filePath, ffprobePath);
  const stream = (info.streams || []).find((s) => s.codec_type === 'audio');
  if (!stream) {
    throw new VideoGenError(ErrorCodes.AUDIO_INVALID, `"${path.basename(filePath)}" does not contain an audio stream.`);
  }
  const fmt = info.format || {};
  const durationSec = Number(fmt.duration ?? stream.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new VideoGenError(ErrorCodes.INVALID_DURATION, `Could not determine a valid duration for "${path.basename(filePath)}".`, {
      details: JSON.stringify({ formatDuration: fmt.duration, streamDuration: stream.duration })
    });
  }
  const bitRate = Number(fmt.bit_rate ?? stream.bit_rate);
  return {
    durationSec,
    format: friendlyFormat(fmt.format_name, filePath),
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
    sizeBytes: Number(fmt.size) || 0
  };
}
