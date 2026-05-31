import { describe, it, expect } from 'vitest';
import { classifyNativePosture } from './nativePostureSource.js';

describe('classifyNativePosture', () => {
  it('reports closed for the narrow cover display', () => {
    expect(classifyNativePosture({ type: 'flat' }, 412, 2.6).mode).toBe('closed');
    expect(classifyNativePosture({ type: 'half-opened' }, 412, 2.6).mode).toBe('closed');
  });

  it('reports book when half-opened, with the hinge orientation', () => {
    const r = classifyNativePosture({ type: 'half-opened', orientation: 'vertical' }, 1000, 2);
    expect(r.mode).toBe('book');
    expect(r.hinge?.orientation).toBe('vertical');
  });

  it('reports flat when fully unfolded', () => {
    expect(classifyNativePosture({ type: 'flat' }, 1000, 2).mode).toBe('flat');
  });

  it('maps the hinge centre from device px to CSS px', () => {
    const r = classifyNativePosture(
      { type: 'half-opened', orientation: 'vertical', hingeLeft: 1040, hingeWidth: 80 },
      900,
      2, // devicePixelRatio
    );
    // centre = (1040 + 80/2) / 2 = 540
    expect(r.hinge?.position).toBe(540);
  });

  it('defaults a missing orientation to a vertical hinge', () => {
    const r = classifyNativePosture({ type: 'half-opened' }, 1000, 1);
    expect(r.hinge?.orientation).toBe('vertical');
  });
});
