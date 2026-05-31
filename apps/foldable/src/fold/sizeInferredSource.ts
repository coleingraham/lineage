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

/**
 * Start the size-inferred posture source: report the current mode immediately,
 * then on every resize that actually changes the mode. Returns a teardown.
 *
 * Guards against the **soft keyboard**: on mobile, opening the keyboard shrinks
 * the viewport *height* (width unchanged), which would otherwise spike the
 * aspect ratio and flip `flat`→`book` mid-edit — swapping the layout and losing
 * the editor. A width-unchanged, large height drop is treated as the keyboard
 * and ignored.
 */
export function startSizeInferredSource(setFold: (fold: FoldState) => void): () => void {
  let last: { w: number; h: number; mode: FoldMode } | null = null;

  const update = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (last && w === last.w && h < last.h - 120) {
      // Keyboard-like: keep the current mode, just track the new height.
      last = { w, h, mode: last.mode };
      return;
    }

    const mode = inferFoldMode(w, h);
    if (!last || mode !== last.mode) {
      setFold({ mode, source: 'size-inferred' });
    }
    last = { w, h, mode };
  };

  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
