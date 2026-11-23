/**
 * Phase 3 storyboard scene — renders timeline shots with visualIntent (mood/layout/motion).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VideoGenError, ErrorCodes } from '../../utils/errors.js';

const TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scene.template.html');

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function generateStoryboardScene({
  sceneDir,
  title,
  subtitle,
  durationSec,
  fps,
  width,
  height,
  seed = 42,
  timeline = null,
  storyboard = null
}) {
  try {
    const shotByScene = new Map((storyboard?.shots || []).map((s) => [s.sceneId, s]));
    const shots = (timeline?.scenes || []).map((sc) => {
      const shot = shotByScene.get(sc.id);
      const intent = shot?.visualIntent || sc.visualIntent || {};
      return {
        sceneId: sc.id,
        start: sc.start,
        end: sc.end,
        text: sc.narration?.text || shot?.narrationText || '',
        importance: sc.importance ?? 0.5,
        segmentType: sc.segment?.type || shot?.segmentType || null,
        visualIntent: intent?.type === 'storyboard' ? intent : null
      };
    });

    const config = {
      title: title || 'CliprPro',
      subtitle: subtitle || null,
      durationSec,
      fps,
      width,
      height,
      seed,
      phase: 3,
      shots,
      segments: (timeline?.segments || []).map((s) => ({ start: s.start, end: s.end, type: s.type }))
    };

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const html = template.replace('__SCENE_CONFIG__', () => safeJson(config));
    fs.mkdirSync(sceneDir, { recursive: true });
    const sceneHtmlPath = path.join(sceneDir, 'scene.html');
    const configPath = path.join(sceneDir, 'scene.config.json');
    fs.writeFileSync(sceneHtmlPath, html);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { name: 'storyboard', sceneHtmlPath, configPath, config };
  } catch (err) {
    throw new VideoGenError(ErrorCodes.SCENE_GENERATION_FAILED, 'Could not generate storyboard scene.', {
      cause: err,
      details: String(err.stack || err)
    });
  }
}
