/**
 * Optional LLM storyboard planner (OpenAI-compatible HTTP API).
 * Requires STORYBOARD_API_KEY (or OPENAI_API_KEY) — never hard-coded.
 */
import { normalizeVisualIntent, MOODS, LAYOUTS, MOTIONS, paletteFor } from './schema.js';
import { planStoryboardHeuristic } from './heuristic.js';
import { VideoGenError, ErrorCodes } from '../utils/errors.js';

function buildPrompt(timeline, script) {
  const scenes = (timeline.scenes || []).map((sc) => ({
    sceneId: sc.id,
    start: sc.start,
    end: sc.end,
    segmentType: sc.segment?.type || null,
    importance: sc.importance,
    text: sc.narration?.text || ''
  }));
  return {
    system:
      'You are a video storyboard planner for a code-driven renderer. ' +
      'Return ONLY valid JSON with shape {"shots":[{"sceneId":"SC001","mood":"...","layout":"...","motion":"...","emphasis":["..."],"visualPrompt":"...","camera":{"zoom":1.05}}]}. ' +
      `mood in ${MOODS.join('|')}; layout in ${LAYOUTS.join('|')}; motion in ${MOTIONS.join('|')}. ` +
      'One shot per sceneId. Keep visualPrompt under 200 chars. No markdown.',
    user: JSON.stringify({
      instruction: 'Plan cinematic but renderable 2D Canvas shot intents for each scene.',
      scenes,
      sentenceCount: script?.sentences?.length || 0
    })
  };
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  return JSON.parse(body);
}

/**
 * @param {object} opts
 * @param {object} opts.timeline
 * @param {object} opts.script
 * @param {object} opts.config
 */
export async function planStoryboardLlm({ timeline, script, config }) {
  const apiKey = config.storyboardApiKey || process.env.STORYBOARD_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (config.storyboardApiUrl || process.env.STORYBOARD_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = config.storyboardModel || process.env.STORYBOARD_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new VideoGenError(
      ErrorCodes.STORYBOARD_UNAVAILABLE,
      'LLM storyboard planner needs STORYBOARD_API_KEY or OPENAI_API_KEY in .env.\n' +
        'Use --planner heuristic (default) for offline planning.'
    );
  }

  const { system, user } = buildPrompt(timeline, script);
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
  } catch (err) {
    throw new VideoGenError(ErrorCodes.STORYBOARD_FAILED, 'Could not reach storyboard LLM API.', {
      cause: err,
      details: String(err.message || err)
    });
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new VideoGenError(ErrorCodes.STORYBOARD_FAILED, `Storyboard LLM API returned HTTP ${response.status}.`, {
      details: details.slice(0, 2000)
    });
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = parseJsonLoose(content);
  } catch (err) {
    throw new VideoGenError(ErrorCodes.STORYBOARD_FAILED, 'Storyboard LLM returned unreadable JSON.', {
      cause: err,
      details: String(content).slice(0, 2000)
    });
  }

  const byId = new Map((parsed.shots || []).map((s) => [s.sceneId, s]));
  // Start from heuristic for full coverage, overlay LLM fields
  const base = planStoryboardHeuristic({ timeline, script });
  const shots = base.shots.map((shot) => {
    const llm = byId.get(shot.sceneId);
    if (!llm) return shot;
    const visualIntent = normalizeVisualIntent(
      {
        mood: llm.mood,
        layout: llm.layout,
        motion: llm.motion,
        emphasis: llm.emphasis,
        visualPrompt: llm.visualPrompt,
        camera: llm.camera,
        palette: paletteFor(llm.mood || shot.visualIntent.mood),
        confidence: 0.8,
        planner: 'llm',
        elements: shot.visualIntent.elements
      },
      shot.visualIntent
    );
    return { ...shot, visualIntent };
  });

  return {
    version: '3.0',
    planner: 'llm',
    plannerVersion: model,
    jobId: timeline.jobId || null,
    generatedAt: new Date().toISOString(),
    shots,
    summary: {
      shotCount: shots.length,
      moods: [...new Set(shots.map((s) => s.visualIntent.mood))],
      layouts: [...new Set(shots.map((s) => s.visualIntent.layout))],
      model
    }
  };
}
