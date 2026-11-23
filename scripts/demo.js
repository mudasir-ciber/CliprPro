#!/usr/bin/env node
/**
 * Demo: creates a synthetic 12 s tone as "voiceover" (NOT speech - just a test signal)
 * and runs the full pipeline with examples/demo/script.txt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, getConfig } from '../src/config.js';
import { run } from '../src/utils/exec.js';
import { generateVideo } from '../src/pipeline/generateVideo.js';
import { VideoGenError } from '../src/utils/errors.js';

const demoDir = path.join(PROJECT_ROOT, 'examples', 'demo');
const scriptPath = path.join(demoDir, 'script.txt');
const audioPath = path.join(demoDir, 'voiceover.mp3');
const config = getConfig();

try {
  if (!fs.existsSync(audioPath)) {
    console.log('[INFO] Creating synthetic demo voiceover (12 s tone) ...');
    const r = await run(config.ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12',
      '-filter_complex', 'amix=inputs=2,tremolo=f=2:d=0.5,volume=0.6',
      '-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k',
      audioPath
    ]).catch((err) => {
      if (err.code === 'ENOENT') throw new VideoGenError('FFMPEG_MISSING', 'FFmpeg not found. Please install FFmpeg and add it to PATH.');
      throw err;
    });
    if (r.code !== 0) throw new VideoGenError('AUDIO_INVALID', 'Could not create demo audio.', { details: r.stderr });
  }
  const result = await generateVideo({ scriptPath, audioPath });
  console.log(`\nDEMO COMPLETE\nJob ID: ${result.jobId}\nOutput: ${path.relative(process.cwd(), result.outputPath)}\n`);
} catch (err) {
  console.error(`\nERROR${err.code ? ` (${err.code})` : ''}: ${err.message}`);
  if (err.logPath) console.error(`Full details in log: ${err.logPath}`);
  process.exit(1);
}
