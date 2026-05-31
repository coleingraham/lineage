/**
 * The cognitive mode selected by the device's physical posture:
 * - `closed` — cover display, a single tall column. Capture.
 * - `book`   — open, half-folded into two portrait pages. Read / review.
 * - `flat`   — open and flat, one wide square/4:3 canvas. Author / restructure.
 */
export type FoldMode = 'closed' | 'book' | 'flat';

/** Geometry of one viewport region (e.g. a page either side of the hinge). */
export interface Segment {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Position and orientation of the physical fold, when known. */
export interface HingeInfo {
  /** Hinge centre along its cross-axis, in CSS pixels. */
  position: number;
  orientation: 'vertical' | 'horizontal';
}

/**
 * The single internal description of fold posture that ALL layout and
 * interaction code reads. It is produced by a swappable posture source so the
 * app never depends on a platform's posture API directly — see
 * {@link FoldState.source}. This is the forward-compat boundary that lets a
 * future iOS `native-plugin` source slot in with zero layout changes.
 */
export interface FoldState {
  mode: FoldMode;
  /** Geometry of each viewport region, when the source can provide it. */
  segments?: Segment[];
  /** Fold position/occlusion, when the source can provide it. */
  hinge?: HingeInfo;
  source: 'web-foldable' | 'native-plugin' | 'size-inferred';
}

/** Sensible default before any source has reported. */
export const DEFAULT_FOLD_STATE: FoldState = {
  mode: 'closed',
  source: 'size-inferred',
};
