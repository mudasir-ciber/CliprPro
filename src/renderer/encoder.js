/**
 * FFmpeg encoding: PNG frames -> H.264 MP4, then merge the ORIGINAL voiceover.
 */
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../utils/exec.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

async function ffmpeg(config, args, code, message) {
  let result;
  try {
    result = await run(config.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new VideoGenError(ErrorCodes.FFMPEG_MISSING, 'FFmpeg not found. Please install FFmpeg and add it to PATH.', { cause: err });
    }
    throw err;
  }
  if (result.code !== 0) throw new VideoGenError(code, message, { details: result.stderr });
  return result;
}

/** frame_%06d.png sequence -> silent H.264 MP4 */
export async function encodeFrames({ framesDir, fps, outputPath, config }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await ffmpeg(
    config,
    [
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%06d.png'),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    ],
    ErrorCodes.ENCODE_FAILED,
    'FFmpeg failed while encoding the frames into a video.'
  );
  if (!fs.existsSync(outputPath)) throw new VideoGenError(ErrorCodes.ENCODE_FAILED, 'FFmpeg finished but no video file was created.');
  return outputPath;
}

/**
 * Mux the original voiceover into the video (video stream is copied, not re-encoded).
 * No -shortest: the full voiceover is always kept (video is at most 1 frame longer than the audio).
 * AAC audio is copied bit-for-bit. Other codecs (MP3/WAV) are converted to AAC because
 * AAC is the most compatible audio codec for MP4.
 */
export async function mergeAudio({ videoPath, audioPath, audioCodec, outputPath, config }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const audioArgs = audioCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '256k'];
  await ffmpeg(
    config,
    [
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      ...audioArgs,
      '-movflags', '+faststart',
      outputPath
    ],
    ErrorCodes.AUDIO_MERGE_FAILED,
    'FFmpeg failed while merging the voiceover into the video.'
  );
  if (!fs.existsSync(outputPath)) throw new VideoGenError(ErrorCodes.AUDIO_MERGE_FAILED, 'FFmpeg finished but no final video was created.');
  return outputPath;
}
