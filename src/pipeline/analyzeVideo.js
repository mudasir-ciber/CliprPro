/**
 * Phase 2 analysis orchestrator:
 * script parse → audio analysis → transcription → alignment → pauses →
 * narrative → importance → timeline → validation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { VideoGenError } from '../utils/errors.js';
import { checkFfmpeg, checkFfprobe } from './checkDependencies.js';
import { validateInputs } from './validateInputs.js';
import { createJob, updateMetadata } from './job.js';
import { parseScript } from '../analysis/scriptParser.js';
import { analyzeAudio } from '../analysis/audioAnalysis.js';
import { transcribe } from '../analysis/transcription/index.js';
import { alignScriptToTranscript } from '../analysis/alignment.js';
import { detectPauses } from '../analysis/pauses.js';
import { segmentNarrative } from '../analysis/narrative.js';
import { scoreImportance } from '../analysis/importance.js';
import { buildTimeline } from '../timeline/engine.js';
import {
  buildCacheIdentity,
  finalizeIdentity,
  readCache,
  writeCache,
  analysisCacheDir
} from '../analysis/cache.js';

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function debugPrint(label, data, debug) {
  if (!debug) return;
  console.log(`\n===== DEBUG: ${label} =====`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

/**
 * Run Phase 2 analysis. Optionally reuses an existing job or creates one.
 *
 * @param {object} options
 * @param {string} options.scriptPath
 * @param {string} options.audioPath
 * @param {object} [options.job] existing job from createJob
 * @param {boolean} [options.createJobIfMissing=true]
 * @param {boolean} [options.force=false] bypass cache
 * @param {boolean} [options.debug=false]
 * @param {boolean} [options.skipDepsCheck=false]
 */
export async function analyzeVideo(options) {
  const config = getConfig(options);
  const logger = options.logger || createLogger();
  const debug = Boolean(options.debug || config.debug);
  let job = options.job || null;

  try {
    if (!options.skipDepsCheck) {
      const ffmpeg = await checkFfmpeg(config);
      const ffprobe = await checkFfprobe(config);
      logger.info(`Deps OK — FFmpeg ${ffmpeg} / FFprobe ${ffprobe}`);
    }

    const { script: scriptFile, audio: audioMeta } = await validateInputs({
      scriptPath: options.scriptPath,
      audioPath: options.audioPath,
      ffprobePath: config.ffprobePath
    });

    if (!job && options.createJobIfMissing !== false) {
      job = createJob({ jobsDir: config.jobsDir });
      logger.attachFile(path.join(job.paths.logs, 'pipeline.log'));
      logger.info(`Job created: ${job.id}`);
      const scriptCopy = path.join(job.paths.input, path.basename(scriptFile.path));
      const audioCopy = path.join(job.paths.input, path.basename(audioMeta.path));
      fs.copyFileSync(scriptFile.path, scriptCopy);
      fs.copyFileSync(audioMeta.path, audioCopy);
      updateMetadata(job, {
        jobId: job.id,
        createdAt: job.createdAt,
        phase: 2,
        status: 'analyzing',
        scriptPath: scriptCopy,
        audioPath: audioCopy,
        originalScriptPath: scriptFile.path,
        originalAudioPath: audioMeta.path,
        error: null
      });
      options = {
        ...options,
        scriptPath: scriptCopy,
        audioPath: audioCopy
      };
    }

    const analysisDir = job?.paths?.analysis || path.join(config.jobsDir, '_analysis');
    fs.mkdirSync(analysisDir, { recursive: true });

    const cacheIdentity = finalizeIdentity(
      buildCacheIdentity({
        scriptPath: options.scriptPath || scriptFile.path,
        audioPath: options.audioPath || audioMeta.path,
        configFingerprint: {
          transcriptionEngine: config.transcriptionEngine,
          language: config.transcriptionLanguage,
          hookWindowSec: config.hookWindowSec,
          alignmentThreshold: config.alignmentThreshold,
          silenceNoiseDb: config.silenceNoiseDb,
          minSilenceSec: config.minSilenceSec,
          analysisVersion: '2.0'
        }
      })
    );

    if (!options.force && !options.noCache) {
      const cached = readCache(analysisCacheDir(PROJECT_ROOT), cacheIdentity.key);
      if (cached?.timeline) {
        logger.info(`Analysis cache hit (${cacheIdentity.key})`);
        for (const [name, data] of Object.entries(cached.artifacts || {})) {
          writeJson(path.join(analysisDir, name), data);
        }
        const cachedAudio = { ...cached.audio, path: options.audioPath || audioMeta.path };
        if (job) {
          updateMetadata(job, {
            status: 'analyzed',
            phase: 2,
            analysisCacheKey: cacheIdentity.key,
            audioDurationSec: cached.audio?.durationSec,
            timelinePath: path.join(analysisDir, 'timeline.json')
          });
        }
        debugPrint('timeline (cache)', cached.timeline, debug);
        return {
          jobId: job?.id || null,
          job,
          cacheHit: true,
          cacheKey: cacheIdentity.key,
          script: cached.script,
          audio: cachedAudio,
          transcript: cached.transcript,
          alignment: cached.alignment,
          pauses: cached.pauses,
          narrative: cached.narrative,
          importance: cached.importance,
          timeline: cached.timeline,
          paths: {
            analysisDir,
            script: path.join(analysisDir, 'script.json'),
            audio: path.join(analysisDir, 'audio.json'),
            transcript: path.join(analysisDir, 'transcript.json'),
            alignment: path.join(analysisDir, 'alignment.json'),
            timeline: path.join(analysisDir, 'timeline.json')
          }
        };
      }
    }

    logger.info('Parsing script');
    const script = parseScript(scriptFile.text);
    writeJson(path.join(analysisDir, 'script.json'), script);
    debugPrint('script.sentences', script.sentences.map((s) => ({ id: s.id, text: s.text })), debug);

    logger.info('Analyzing audio (metadata + silence)');
    const audioPathResolved = options.audioPath || audioMeta.path;
    const audio = await analyzeAudio(audioPathResolved, {
      ffprobePath: config.ffprobePath,
      ffmpegPath: config.ffmpegPath,
      noiseDb: config.silenceNoiseDb,
      minSilenceSec: config.minSilenceSec
    });
    audio.path = audioPathResolved;
    writeJson(path.join(analysisDir, 'audio.json'), audio);
    // Keep Phase 1 compatible copy
    if (job?.paths?.audio) {
      writeJson(path.join(job.paths.audio, 'analysis.json'), audio);
    }
    debugPrint('audio.silence', audio.silence, debug);

    logger.info(`Transcribing (engine=${config.transcriptionEngine})`);
    const transcript = await transcribe({
      audioPath: options.audioPath || audioMeta.path,
      script,
      audio,
      engine: config.transcriptionEngine,
      language: config.transcriptionLanguage
    });
    writeJson(path.join(analysisDir, 'transcript.json'), transcript);
    debugPrint('transcript.segments', transcript.segments, debug);

    logger.info('Aligning script to transcript');
    const alignment = alignScriptToTranscript({
      sentences: script.sentences,
      segments: transcript.segments,
      threshold: config.alignmentThreshold
    });
    writeJson(path.join(analysisDir, 'alignment.json'), alignment);
    debugPrint('alignment', alignment.alignments, debug);

    logger.info('Detecting pauses');
    const pauses = detectPauses({
      audio,
      alignment,
      durationSec: audio.durationSec,
      thresholds: {
        shortMax: config.pauseShortMax,
        mediumMax: config.pauseMediumMax,
        minGapSec: config.pauseMinGap
      }
    });
    writeJson(path.join(analysisDir, 'pauses.json'), pauses);
    debugPrint('pauses', pauses.pauses, debug);

    logger.info('Segmenting narrative (heuristic)');
    const narrative = segmentNarrative({
      sentences: script.sentences,
      alignment,
      durationSec: audio.durationSec,
      hookWindowSec: config.hookWindowSec
    });
    writeJson(path.join(analysisDir, 'narrative.json'), narrative);
    debugPrint('narrative.segments', narrative.segments, debug);

    logger.info('Scoring importance');
    const importance = scoreImportance({
      sentences: script.sentences,
      alignment,
      narrative,
      pauses,
      durationSec: audio.durationSec
    });
    writeJson(path.join(analysisDir, 'importance.json'), importance);
    debugPrint('importance', importance.scores, debug);

    logger.info('Building timeline');
    const timeline = buildTimeline({
      jobId: job?.id || 'ad-hoc',
      audio,
      script,
      alignment,
      narrative,
      importance,
      pauses
    });
    timeline.meta.transcriptionEngine = transcript.engine;
    writeJson(path.join(analysisDir, 'timeline.json'), timeline);
    debugPrint('timeline.validation', timeline.validation, debug);
    debugPrint('timeline.scenes', timeline.scenes, debug);

    if (!timeline.validation.valid) {
      logger.warn(`Timeline has ${timeline.validation.errors.length} validation error(s)`);
    } else {
      logger.info('Timeline validated OK');
    }

    writeCache(analysisCacheDir(PROJECT_ROOT), cacheIdentity.key, {
      identity: cacheIdentity,
      script,
      audio,
      transcript,
      alignment,
      pauses,
      narrative,
      importance,
      timeline,
      artifacts: {
        'script.json': script,
        'audio.json': audio,
        'transcript.json': transcript,
        'alignment.json': alignment,
        'pauses.json': pauses,
        'narrative.json': narrative,
        'importance.json': importance,
        'timeline.json': timeline
      }
    });

    if (job) {
      updateMetadata(job, {
        status: 'analyzed',
        phase: 2,
        analysisCacheKey: cacheIdentity.key,
        audioDurationSec: audio.durationSec,
        fps: config.fps,
        resolution: { width: config.width, height: config.height },
        timelinePath: path.join(analysisDir, 'timeline.json'),
        timelineValid: timeline.validation.valid
      });
    }

    return {
      jobId: job?.id || null,
      job,
      cacheHit: false,
      cacheKey: cacheIdentity.key,
      script,
      audio,
      transcript,
      alignment,
      pauses,
      narrative,
      importance,
      timeline,
      paths: {
        analysisDir,
        script: path.join(analysisDir, 'script.json'),
        audio: path.join(analysisDir, 'audio.json'),
        transcript: path.join(analysisDir, 'transcript.json'),
        alignment: path.join(analysisDir, 'alignment.json'),
        timeline: path.join(analysisDir, 'timeline.json')
      }
    };
  } catch (err) {
    const known = err instanceof VideoGenError;
    const firstLine = String(err.message).split('\n')[0];
    logger.error(known ? `[${err.code}] ${firstLine}` : `Unexpected error: ${firstLine}`);
    if (err.details) logger.detail(`Details: ${err.details}`);
    if (err.stack) logger.detail(`Stack: ${err.stack}`);
    if (job) {
      updateMetadata(job, {
        status: 'failed',
        error: { code: known ? err.code : 'UNEXPECTED', message: err.message }
      });
      err.jobId = job.id;
      err.logPath = logger.filePath;
    }
    throw err;
  }
}
