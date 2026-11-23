/** Sanity-check the final MP4 with ffprobe. */
import { ffprobeJson } from '../audio/probe.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

export async function verifyOutput({ videoPath, expected, ffprobePath }) {
  const info = await ffprobeJson(videoPath, ffprobePath);
  const video = (info.streams || []).find((s) => s.codec_type === 'video');
  const audio = (info.streams || []).find((s) => s.codec_type === 'audio');
  if (!video) throw new VideoGenError(ErrorCodes.OUTPUT_INVALID, 'Final MP4 has no video stream.');
  if (!audio) throw new VideoGenError(ErrorCodes.OUTPUT_INVALID, 'Final MP4 has no audio stream.');
  if (video.width !== expected.width || video.height !== expected.height) {
    throw new VideoGenError(ErrorCodes.OUTPUT_INVALID, `Final MP4 resolution is ${video.width}x${video.height}, expected ${expected.width}x${expected.height}.`);
  }
  const duration = Number(info.format?.duration);
  const warnings = [];
  if (Number.isFinite(duration) && Math.abs(duration - expected.durationSec) > 0.25) {
    warnings.push(`Final duration ${duration.toFixed(2)}s differs from voiceover ${expected.durationSec.toFixed(2)}s`);
  }
  return {
    durationSec: duration,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    width: video.width,
    height: video.height,
    warnings
  };
}
