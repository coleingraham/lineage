import { describe, it, expect } from 'vitest';
import { classifyWebFold } from './webFoldableSource.js';

describe('classifyWebFold', () => {
  it('reports closed for the narrow cover display regardless of posture', () => {
    expect(classifyWebFold({ width: 412, posture: 'folded', horizontalSegments: false, verticalSegments: false }).mode).toBe('closed');
    expect(classifyWebFold({ width: 412, posture: 'continuous', horizontalSegments: true, verticalSegments: false }).mode).toBe('closed');
  });

  it('reports book when folded with two side-by-side segments (vertical hinge)', () => {
    const r = classifyWebFold({ width: 1000, posture: 'folded', horizontalSegments: true, verticalSegments: false });
    expect(r.mode).toBe('book');
    expect(r.hingeOrientation).toBe('vertical');
  });

  it('reports book with a horizontal hinge for stacked segments', () => {
    const r = classifyWebFold({ width: 1000, posture: 'folded', horizontalSegments: false, verticalSegments: true });
    expect(r.mode).toBe('book');
    expect(r.hingeOrientation).toBe('horizontal');
  });

  it('reports flat when unfolded (continuous), even with a large viewport', () => {
    expect(classifyWebFold({ width: 1000, posture: 'continuous', horizontalSegments: false, verticalSegments: false }).mode).toBe('flat');
  });

  it('reports flat when folded but no segments are reported', () => {
    expect(classifyWebFold({ width: 1000, posture: 'folded', horizontalSegments: false, verticalSegments: false }).mode).toBe('flat');
  });

  it('does not attach a hinge unless book', () => {
    expect(classifyWebFold({ width: 1000, posture: 'continuous', horizontalSegments: false, verticalSegments: false }).hingeOrientation).toBeUndefined();
  });
});
