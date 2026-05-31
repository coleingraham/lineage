/**
 * Resolve a touch delta into a horizontal page-turn direction, or `null` when
 * it isn't a clear horizontal swipe (so vertical scrolling isn't hijacked).
 * `right` walks back up the spine; `left` walks forward.
 */
export function swipeDirection(dx: number, dy: number, threshold = 64): 'left' | 'right' | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'right' : 'left';
}
