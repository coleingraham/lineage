import { describe, it, expect } from 'vitest';
import { swipeDirection } from './swipe.js';

describe('swipeDirection', () => {
  it('returns right for a clear rightward swipe', () => {
    expect(swipeDirection(120, 10)).toBe('right');
  });

  it('returns left for a clear leftward swipe', () => {
    expect(swipeDirection(-120, 10)).toBe('left');
  });

  it('ignores short swipes below the threshold', () => {
    expect(swipeDirection(40, 0)).toBeNull();
  });

  it('ignores mostly-vertical swipes so scrolling is not hijacked', () => {
    expect(swipeDirection(70, 120)).toBeNull();
  });
});
