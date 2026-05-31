import { describe, it, expect } from 'vitest';
import { inferFoldMode } from './sizeInferredSource.js';

describe('inferFoldMode', () => {
  it('reports closed for a narrow phone column', () => {
    expect(inferFoldMode(412, 915)).toBe('closed'); // Pixel cover-ish
    expect(inferFoldMode(360, 800)).toBe('closed');
  });

  it('reports flat for a wide near-square canvas', () => {
    expect(inferFoldMode(1024, 1024)).toBe('flat'); // unfolded inner ~1:1
    expect(inferFoldMode(900, 1000)).toBe('flat');
  });

  it('reports book for a wide landscape canvas held across the hinge', () => {
    expect(inferFoldMode(1400, 800)).toBe('book');
  });

  it('flips closed↔flat across the width threshold', () => {
    expect(inferFoldMode(639, 900)).toBe('closed');
    expect(inferFoldMode(641, 900)).toBe('flat');
  });
});
