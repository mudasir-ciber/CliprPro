/**
 * Phase 4 advanced 2D visual presets (shared by planner + docs).
 * Scene HTML mirrors these names; keep lists in sync with schema.
 */

export const MOTIFS = [
  'geometric',
  'waveform',
  'constellation',
  'grid',
  'ribbons',
  'rings',
  'bars',
  'aurora'
];

export const TRANSITIONS = [
  'soft-fade',
  'rise-blur',
  'wipe-soft',
  'zoom-punch',
  'slide-stack',
  'glitch-snap'
];

export const TYPE_STYLES = ['display', 'editorial', 'mono-tech', 'bold-impact'];

export const FX_FLAGS = ['glow', 'vignette', 'parallax', 'scan'];

/** Role → preferred advanced 2D look */
export const ROLE_VISUAL_2D = Object.freeze({
  hook: { motif: 'aurora', transition: 'zoom-punch', typography: 'bold-impact', fx: ['glow', 'vignette', 'parallax'] },
  setup: { motif: 'grid', transition: 'soft-fade', typography: 'editorial', fx: ['vignette', 'parallax'] },
  development: { motif: 'waveform', transition: 'rise-blur', typography: 'display', fx: ['glow', 'parallax'] },
  escalation: { motif: 'bars', transition: 'slide-stack', typography: 'mono-tech', fx: ['glow', 'scan'] },
  climax: { motif: 'rings', transition: 'glitch-snap', typography: 'bold-impact', fx: ['glow', 'vignette', 'parallax'] },
  resolution: { motif: 'ribbons', transition: 'soft-fade', typography: 'editorial', fx: ['vignette'] },
  conclusion: { motif: 'constellation', transition: 'rise-blur', typography: 'display', fx: ['glow', 'parallax'] }
});
