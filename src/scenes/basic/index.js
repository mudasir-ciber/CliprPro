/**
 * Basic scene generator (Phase 1 + Phase 2 timeline narration).
 * Fills the HTML template with a JSON config and writes the scene into the job's scenes/ folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VideoGenError, ErrorCodes } from '../../utils/errors.js';

const TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scene.template.html');

/** JSON that is safe to embed inside a <script> tag. */
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function generateBasicScene({
  sceneDir,
  title,
  subtitle,
  durationSec,
  fps,
  width,
  height,
  seed = 1234,
  timeline = null
}) {
  try {
    const narration = (timeline?.scenes || []).map((sc) => ({
      start: sc.start,
      end: sc.end,
      text: sc.narration?.text || '',
      importance: sc.importance ?? 0.5,
      segmentType: sc.segment?.type || null
    }));

    const config = {
      title,
      subtitle: subtitle || null,
      durationSec,
      fps,
      width,
      height,
      seed,
      narration,
      segments: (timeline?.segments || []).map((s) => ({
        start: s.start,
        end: s.end,
        type: s.type
      }))
    };
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const html = template.replace('__SCENE_CONFIG__', () => safeJson(config));
    fs.mkdirSync(sceneDir, { recursive: true });
    const sceneHtmlPath = path.join(sceneDir, 'scene.html');
    const configPath = path.join(sceneDir, 'scene.config.json');
    fs.writeFileSync(sceneHtmlPath, html);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { name: 'basic', sceneHtmlPath, configPath, config };
  } catch (err) {
    throw new VideoGenError(ErrorCodes.SCENE_GENERATION_FAILED, 'Could not generate the scene file.', {
      cause: err,
      details: String(err.stack || err)
    });
  }
}
