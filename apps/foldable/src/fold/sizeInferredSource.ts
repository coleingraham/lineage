import type { FoldMode, FoldState } from './types.js';

/**
 * Classify a fold mode from window dimensions and aspect alone — the fallback
 * source that works anywhere, with no posture API. It cannot detect a real
 * hinge, so it only ever reports `mode` (no `segments`/`hinge`).
 *
 * Heuristic (approximate by design — this is the no-API fallback):
 * - a narrow column → `closed` (cover display / any phone held in portrait)
 * - a wide, clearly landscape canvas → `book` (held open across a vertical hinge)
 * - otherwise a large near-square/portrait canvas → `flat` (one continuous page)
 */
export function inferFoldMode(width: number, height: number): FoldMode {
  if (width < 640) return 'closed';
  const aspect = width / height;
  if (aspect >= 1.5) return 'book';
  return 'flat';
}

function currentFoldState(): FoldState {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { mode: inferFoldMode(width, height), source: 'size-inferred' };
}

/**
 * Start the size-inferred posture source: report the current mode immediately,
 * then on every resize. Returns a teardown function that removes the listener.
 */
export function startSizeInferredSource(setFold: (fold: FoldState) => void): () => void {
  const update = () => setFold(currentFoldState());
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
