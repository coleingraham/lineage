import type { FoldMode, FoldState } from './types.js';

/**
 * The `web-foldable` posture source: reads real device posture on Android
 * Chromium via the **Device Posture API** (`navigator.devicePosture`) and the
 * **viewport-segment** CSS media features. Unlike the size-inferred fallback,
 * this can tell a physical half-fold (`book`) from a flat unfold — the viewport
 * alone can't, because folding doesn't change it.
 *
 * Chromium-only: on WebKit (iOS) these APIs are absent, so the app falls back
 * to size-inferred. All of this stays behind the `FoldState` boundary.
 */

type PostureType = 'continuous' | 'folded';

interface DevicePostureLike extends EventTarget {
  readonly type: PostureType;
}

/** Access `navigator.devicePosture` without depending on its presence in lib.dom. */
function devicePosture(): DevicePostureLike | null {
  if (typeof navigator === 'undefined') return null;
  const n = navigator as unknown as { devicePosture?: DevicePostureLike };
  return n.devicePosture ?? null;
}

// Two segments along the horizontal axis = two columns side-by-side (a vertical
// hinge); along the vertical axis = stacked pages (a horizontal hinge).
const HORIZONTAL_SEGMENTS = '(horizontal-viewport-segments: 2)';
const VERTICAL_SEGMENTS = '(vertical-viewport-segments: 2)';

export interface WebFoldInputs {
  width: number;
  posture: PostureType | null;
  horizontalSegments: boolean;
  verticalSegments: boolean;
}

export interface WebFoldResult {
  mode: FoldMode;
  hingeOrientation?: 'vertical' | 'horizontal';
}

/**
 * Pure posture → mode decision (size-independent of the DOM, so it's unit
 * tested). A narrow viewport is the cover display (`closed`) regardless of
 * posture; a `folded` device reporting two viewport segments is `book`;
 * anything else large is one continuous `flat` canvas.
 */
export function classifyWebFold(i: WebFoldInputs): WebFoldResult {
  if (i.width < 640) return { mode: 'closed' };
  if (i.posture === 'folded' && (i.horizontalSegments || i.verticalSegments)) {
    return { mode: 'book', hingeOrientation: i.horizontalSegments ? 'vertical' : 'horizontal' };
  }
  return { mode: 'flat' };
}

function compute(): FoldState {
  const dp = devicePosture();
  const result = classifyWebFold({
    width: window.innerWidth,
    posture: dp ? dp.type : null,
    horizontalSegments: window.matchMedia(HORIZONTAL_SEGMENTS).matches,
    verticalSegments: window.matchMedia(VERTICAL_SEGMENTS).matches,
  });

  const fold: FoldState = { mode: result.mode, source: 'web-foldable' };
  if (result.hingeOrientation) {
    // Precise hinge geometry needs the viewport-segment env() values; absent
    // those, approximate a centred hinge (degrades gracefully — nothing depends
    // on exact geometry yet, and book foldables hinge centrally).
    fold.hinge = {
      orientation: result.hingeOrientation,
      position:
        result.hingeOrientation === 'vertical'
          ? Math.round(window.innerWidth / 2)
          : Math.round(window.innerHeight / 2),
    };
  }
  return fold;
}

/** True when the platform exposes the Device Posture API (Android Chromium). */
export function isWebFoldableSupported(): boolean {
  return devicePosture() !== null;
}

/**
 * Start the web-foldable source: report posture now, then on every posture
 * change, viewport-segment change, and resize. Returns a teardown function.
 */
export function startWebFoldableSource(setFold: (fold: FoldState) => void): () => void {
  const update = () => setFold(compute());
  update();

  const dp = devicePosture();
  dp?.addEventListener('change', update);
  const mqls = [window.matchMedia(HORIZONTAL_SEGMENTS), window.matchMedia(VERTICAL_SEGMENTS)];
  for (const mql of mqls) mql.addEventListener('change', update);
  window.addEventListener('resize', update);

  return () => {
    dp?.removeEventListener('change', update);
    for (const mql of mqls) mql.removeEventListener('change', update);
    window.removeEventListener('resize', update);
  };
}
