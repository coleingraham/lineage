export const COLORS = {
  bg: '#0c0d10',
  surface: '#0f1014',
  elevated: '#141418',
  border: 'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.1)',

  human: '#c8b88a',
  ai: '#7ec8b8',
  summary: '#b8a0d8',
  root: '#e2c97e',
  branch: '#7ec8a0',

  muted: '#333',
  dim: '#222',
  text: '#e8e8e8',
  textSecondary: '#666',
} as const;

export const FONTS = {
  mono: "'IBM Plex Mono', monospace",
  serif: "'Libre Baskerville', serif",
} as const;

/** Per-branch-intent accent colour for divergence labels and rails. */
export function intentColor(intent: string | null): string {
  switch (intent) {
    case 'alternative':
      return '#7ec8a0';
    case 'elaboration':
      return '#7ec8b8';
    case 'objection':
      return '#d88a8a';
    case 'sequence':
      return COLORS.textSecondary;
    default:
      return COLORS.border;
  }
}
