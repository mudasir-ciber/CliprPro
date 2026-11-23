/** Scene registry. Phase 3 adds storyboard-driven Canvas scenes. */
import { generateBasicScene } from './basic/index.js';
import { generateStoryboardScene } from './storyboard/index.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

const SCENES = {
  basic: generateBasicScene,
  storyboard: generateStoryboardScene
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
