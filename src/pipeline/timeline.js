/**
 * Timeline math. The voiceover duration is the MASTER duration.
 * Phase 2 will extend this with speech/sentence/scene timing.
 */
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/**
 * totalFrames = ceil(duration * fps); never less than 1.
 * A tiny tolerance (0.0001 frame) absorbs float noise such as 10.0000001 s -> 300, not 301, frames.
 */
export function calculateTotalFrames(durationSec, fps) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new VideoGenError(ErrorCodes.INVALID_DURATION, `Invalid duration: ${durationSec}`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new VideoGenError(ErrorCodes.INVALID_CONFIG, `Invalid FPS: ${fps}`);
  }
  return Math.max(1, Math.ceil(durationSec * fps - 1e-4));
}

/** Timestamp (seconds) of a 0-based frame index. */
export function frameTime(index, fps) {
  return index / fps;
}

/** frame_000001.png for 0-based index 0 (numbering starts at 1 for FFmpeg). */
export function frameFileName(index) {
  return `frame_${String(index + 1).padStart(6, '0')}.png`;
}

export function createTimeline({ durationSec, fps }) {
  return {
    durationSec,
    fps,
    totalFrames: calculateTotalFrames(durationSec, fps),
    frameDurationSec: 1 / fps
  };
}
