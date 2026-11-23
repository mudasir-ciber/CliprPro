/** Scene registry — basic, storyboard (2D), threejs (Phase 5 WebGL). */
import { generateBasicScene } from './basic/index.js';
import { generateStoryboardScene } from './storyboard/index.js';
import { generateThreejsScene } from './threejs/index.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

const SCENES = {
  basic: generateBasicScene,
  storyboard: generateStoryboardScene,
  threejs: generateThreejsScene
};

export function generateScene(name, options) {
  const generator = SCENES[name];
  if (!generator) {
    throw new VideoGenError(
      ErrorCodes.SCENE_GENERATION_FAILED,
      `Unknown scene "${name}". Available: ${Object.keys(SCENES).join(', ')}`
    );
  }
  return generator(options);
}

export function listScenes() {
  return Object.keys(SCENES);
}
