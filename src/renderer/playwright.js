import { VideoGenError, ErrorCodes } from '../utils/errors.js';

/** Dynamic import so a missing Playwright gives a clean error instead of a crash. */
export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    throw new VideoGenError(
      ErrorCodes.PLAYWRIGHT_MISSING,
      'Playwright is not installed.\nRun: npm install   and then   npx playwright install chromium',
      { cause: err }
    );
  }
}
