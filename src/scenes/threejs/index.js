/**
 * Phase 5 Three.js / WebGL scene generator.
 * Copies a local three.module build into the job scenes folder (offline file:// safe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from '../../config.js';
import { VideoGenError, ErrorCodes } from '../../utils/errors.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(HERE, 'scene.template.html');
const THREE_CANDIDATES = [
  path.join(PROJECT_ROOT, 'node_modules', 'three', 'build', 'three.module.min.js'),
  path.join(PROJECT_ROOT, 'node_modules', 'three', 'build', 'three.module.js')
];

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function resolveThreeModule() {
  for (const p of THREE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new VideoGenError(
    ErrorCodes.SCENE_GENERATION_FAILED,
    'three.js is not installed. Run: npm install three'
  );
}

export function generateThreejsScene({
  sceneDir,
  title,
  subtitle,
  durationSec,
  fps,
  width,
  height,
  seed = 77,
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
      phase: 5,
      shots,
      segments: (timeline?.segments || []).map((s) => ({ start: s.start, end: s.end, type: s.type }))
    };

    fs.mkdirSync(sceneDir, { recursive: true });
    const vendorDir = path.join(sceneDir, 'vendor');
    fs.mkdirSync(vendorDir, { recursive: true });
    const threeSrc = resolveThreeModule();
    const threeDest = path.join(vendorDir, 'three.module.js');
    fs.copyFileSync(threeSrc, threeDest);

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const html = template.replace('__SCENE_CONFIG__', () => safeJson(config));
    const sceneHtmlPath = path.join(sceneDir, 'scene.html');
    const configPath = path.join(sceneDir, 'scene.config.json');
    fs.writeFileSync(sceneHtmlPath, html);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { name: 'threejs', sceneHtmlPath, configPath, config, vendor: { three: threeDest } };
  } catch (err) {
    if (err instanceof VideoGenError) throw err;
    throw new VideoGenError(ErrorCodes.SCENE_GENERATION_FAILED, 'Could not generate Three.js scene.', {
      cause: err,
      details: String(err.stack || err)
    });
  }
}
