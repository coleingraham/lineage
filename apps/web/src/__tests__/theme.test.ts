import { describe, it, expect } from 'vitest';
import { nodeColor, COLORS } from '../styles/theme.js';

describe('nodeColor', () => {
  it('returns human color for human type', () => {
    expect(nodeColor('human', false)).toBe(COLORS.human);
  });

  it('returns ai color for ai type', () => {
    expect(nodeColor('ai', false)).toBe(COLORS.ai);
  });

  it('returns summary color for summary type', () => {
    expect(nodeColor('summary', false)).toBe(COLORS.summary);
  });

  it('returns muted color when node is deleted regardless of type', () => {
    expect(nodeColor('human', true)).toBe(COLORS.muted);
    expect(nodeColor('ai', true)).toBe(COLORS.muted);
    expect(nodeColor('summary', true)).toBe(COLORS.muted);
  });

  it('falls back to ai color for unknown types', () => {
    expect(nodeColor('unknown', false)).toBe(COLORS.ai);
  });
});
