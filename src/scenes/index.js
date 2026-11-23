/** Scene registry. Phase 3+ will add AI-planned scenes here. */
import { generateBasicScene } from './basic/index.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

const SCENES = { basic: generateBasicScene };

export function generateScene(name, options) {
  const generator = SCENES[name];
  if (!generator) throw new VideoGenError(ErrorCodes.SCENE_GENERATION_FAILED, `Unknown scene "${name}". Available: ${Object.keys(SCENES).join(', ')}`);
  return generator(options);
}
