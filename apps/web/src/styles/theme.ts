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

export function nodeColor(type: string, isDeleted: boolean): string {
  if (isDeleted) return COLORS.muted;
  switch (type) {
    case 'human':
      return COLORS.human;
    case 'ai':
      return COLORS.ai;
    case 'summary':
      return COLORS.summary;
    default:
      return COLORS.ai;
  }
}
