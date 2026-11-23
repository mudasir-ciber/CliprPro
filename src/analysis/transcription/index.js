/**
 * Transcription abstraction. Engines are swappable; default is local estimated timing.
 * Optional: TRANSCRIPTION_ENGINE=whisper loads @xenova/transformers if installed.
 */
import { VideoGenError, ErrorCodes } from '../../utils/errors.js';
import { transcribeEstimated } from './estimated.js';

export const TRANSCRIPTION_ENGINES = ['estimated', 'whisper'];

/**
 * @param {object} opts
 * @param {string} opts.audioPath
 * @param {object} opts.script
 * @param {object} opts.audio
 * @param {string} [opts.engine]
 * @param {string} [opts.language]
 */
export async function transcribe(opts) {
  const engine = (opts.engine || process.env.TRANSCRIPTION_ENGINE || 'estimated').toLowerCase();
  const language = opts.language || process.env.TRANSCRIPTION_LANGUAGE || 'en';

  if (engine === 'estimated') {
    return transcribeEstimated({ script: opts.script, audio: opts.audio, language });
  }

  if (engine === 'whisper') {
    try {
      const mod = await import('./whisper.js');
      return await mod.transcribeWhisper({
        audioPath: opts.audioPath,
        language,
        script: opts.script,
        audio: opts.audio
      });
    } catch (err) {
      if (err instanceof VideoGenError) throw err;
      throw new VideoGenError(
        ErrorCodes.TRANSCRIPTION_UNAVAILABLE,
        'Whisper transcription is not available. Install optional deps or set TRANSCRIPTION_ENGINE=estimated.\n' +
          'See README for local Whisper setup.',
        { cause: err, details: String(err.message || err) }
      );
    }
  }

  throw new VideoGenError(
    ErrorCodes.INVALID_CONFIG,
    `Unknown transcription engine "${engine}". Supported: ${TRANSCRIPTION_ENGINES.join(', ')}`
  );
}
