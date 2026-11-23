/**
 * Timeline validation — machine-readable errors vs warnings.
 */

function err(code, message, path = null) {
  return { level: 'error', code, message, path };
}
function warn(code, message, path = null) {
  return { level: 'warning', code, message, path };
}

/**
 * @param {object} timeline
 * @returns {{valid:boolean, errors:Array, warnings:Array}}
 */
export function validateTimeline(timeline) {
  const errors = [];
  const warnings = [];

  if (!timeline || typeof timeline !== 'object') {
    return { valid: false, errors: [err('NOT_OBJECT', 'Timeline must be a JSON object')], warnings: [] };
  }

  if (timeline.version !== '2.0') {
    warnings.push(warn('VERSION', `Unexpected timeline version "${timeline.version}" (expected 2.0)`));
  }

  const duration = timeline.audio?.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push(err('AUDIO_DURATION', 'audio.duration must be a positive number', 'audio.duration'));
  }
  if (timeline.audio && timeline.audio.masterClock !== true) {
    warnings.push(warn('MASTER_CLOCK', 'audio.masterClock should be true', 'audio.masterClock'));
  }

  const scenes = timeline.scenes || [];
  const segments = timeline.segments || [];
  const pauses = timeline.pauses || [];
  const sceneIds = new Set();
  const segIds = new Set(segments.map((s) => s.id));

  let prevEnd = 0;
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const p = `scenes[${i}]`;
    if (!sc.id) errors.push(err('SCENE_ID', 'Scene missing id', p));
    if (sceneIds.has(sc.id)) errors.push(err('SCENE_DUP', `Duplicate scene id ${sc.id}`, p));
    sceneIds.add(sc.id);

    if (!Number.isFinite(sc.start) || !Number.isFinite(sc.end)) {
      errors.push(err('SCENE_TIMES', `Scene ${sc.id} needs numeric start/end`, p));
      continue;
    }
    if (sc.start < -1e-6) errors.push(err('SCENE_NEG', `Scene ${sc.id} start is negative`, p));
    if (sc.end < sc.start) errors.push(err('SCENE_ORDER', `Scene ${sc.id} end < start`, p));
    const dur = sc.end - sc.start;
    if (Math.abs((sc.duration ?? dur) - dur) > 0.05) {
      errors.push(err('SCENE_DURATION', `Scene ${sc.id} duration does not match end-start`, `${p}.duration`));
    }
    if (duration && sc.end > duration + 0.08) {
      errors.push(err('SCENE_BEYOND', `Scene ${sc.id} ends after audio duration`, p));
    }
    if (i > 0 && sc.start + 1e-3 < prevEnd) {
      errors.push(err('SCENE_OVERLAP', `Scene ${sc.id} overlaps previous scene`, p));
    }
    prevEnd = Math.max(prevEnd, sc.end);

    if (sc.segmentId && !segIds.has(sc.segmentId)) {
      errors.push(err('SEG_REF', `Scene ${sc.id} references missing segment ${sc.segmentId}`, `${p}.segmentId`));
    }
    if (!Array.isArray(sc.sourceSentenceIds)) {
      warnings.push(warn('SENTENCE_IDS', `Scene ${sc.id} missing sourceSentenceIds`, p));
    }
    if (sc.importance == null) {
      warnings.push(warn('IMPORTANCE', `Scene ${sc.id} missing importance`, p));
    }
  }

  for (let i = 0; i < segments.length; i++) {
    const sg = segments[i];
    const p = `segments[${i}]`;
    if (!sg.id || !sg.type) errors.push(err('SEG_FIELDS', 'Segment needs id and type', p));
    if (Number.isFinite(sg.start) && Number.isFinite(sg.end)) {
      if (sg.end < sg.start) errors.push(err('SEG_ORDER', `Segment ${sg.id} end < start`, p));
      if (duration && sg.end > duration + 0.08) {
        warnings.push(warn('SEG_BEYOND', `Segment ${sg.id} ends after audio`, p));
      }
    }
  }

  for (let i = 0; i < pauses.length; i++) {
    const pz = pauses[i];
    const p = `pauses[${i}]`;
    if (!Number.isFinite(pz.start) || !Number.isFinite(pz.end) || pz.end < pz.start) {
      errors.push(err('PAUSE_TIMES', `Pause ${pz.id || i} has invalid times`, p));
    }
    if (duration && pz.end > duration + 0.08) {
      warnings.push(warn('PAUSE_BEYOND', `Pause ${pz.id} ends after audio`, p));
    }
    const d = (pz.end ?? 0) - (pz.start ?? 0);
    if (pz.duration != null && Math.abs(pz.duration - d) > 0.05) {
      warnings.push(warn('PAUSE_DURATION', `Pause ${pz.id} duration mismatch`, p));
    }
  }

  if (!scenes.length) warnings.push(warn('NO_SCENES', 'Timeline has no scenes'));

  // Coverage check
  if (scenes.length && duration) {
    const covered = scenes.reduce((n, s) => n + Math.max(0, s.end - s.start), 0);
    if (covered < duration * 0.5) {
      warnings.push(warn('LOW_COVERAGE', `Scenes cover only ${(covered / duration * 100).toFixed(0)}% of audio`));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
