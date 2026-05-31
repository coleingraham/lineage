import { Capacitor, registerPlugin } from '@capacitor/core';
import type { FoldMode, FoldState, HingeInfo } from './types.js';

/** Shape returned by the native `Posture` plugin (Jetpack WindowManager). */
export interface PosturePayload {
  type?: 'flat' | 'half-opened';
  orientation?: 'vertical' | 'horizontal';
  isSeparating?: boolean;
  /** Hinge bounds in **device** pixels. */
  hingeLeft?: number;
  hingeTop?: number;
  hingeWidth?: number;
  hingeHeight?: number;
}

interface PosturePlugin {
  getPosture(): Promise<PosturePayload>;
  addListener(
    eventName: 'postureChange',
    listener: (payload: PosturePayload) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Posture = registerPlugin<PosturePlugin>('Posture');

/** Available only on native Android, where the plugin is registered. */
export function isNativePostureSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export interface NativeFoldResult {
  mode: FoldMode;
  hinge?: HingeInfo;
}

function hingeFromPayload(
  p: PosturePayload,
  orientation: 'vertical' | 'horizontal',
  dpr: number,
): HingeInfo {
  const safeDpr = dpr > 0 ? dpr : 1;
  // Map the hinge centre + thickness from device px to CSS px.
  if (orientation === 'vertical' && typeof p.hingeLeft === 'number' && typeof p.hingeWidth === 'number') {
    return {
      orientation,
      position: Math.round((p.hingeLeft + p.hingeWidth / 2) / safeDpr),
      size: Math.round(p.hingeWidth / safeDpr),
    };
  }
  if (orientation === 'horizontal' && typeof p.hingeTop === 'number' && typeof p.hingeHeight === 'number') {
    return {
      orientation,
      position: Math.round((p.hingeTop + p.hingeHeight / 2) / safeDpr),
      size: Math.round(p.hingeHeight / safeDpr),
    };
  }
  return { orientation, position: 0 };
}

/**
 * Pure posture → mode decision (unit tested). A narrow viewport is the cover
 * display (`closed`); a half-opened fold is `book`; anything else is `flat`.
 */
export function classifyNativePosture(
  payload: PosturePayload,
  width: number,
  dpr: number,
): NativeFoldResult {
  if (width < 640) return { mode: 'closed' };
  if (payload.type === 'half-opened') {
    const orientation = payload.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    return { mode: 'book', hinge: hingeFromPayload(payload, orientation, dpr) };
  }
  return { mode: 'flat' };
}

/**
 * Start the native posture source: read current posture, subscribe to
 * `postureChange`, and re-evaluate on resize (for the cover/closed threshold).
 * Async because the plugin calls are promises; resolves to a teardown fn.
 */
export async function startNativePostureSource(
  setFold: (fold: FoldState) => void,
): Promise<() => void> {
  let last: PosturePayload = { type: 'flat' };
  let lastKey = '';

  const apply = () => {
    const r = classifyNativePosture(last, window.innerWidth, window.devicePixelRatio);
    const key = `${r.mode}|${r.hinge?.orientation ?? ''}|${r.hinge?.position ?? ''}`;
    if (key === lastKey) return;
    lastKey = key;
    const fold: FoldState = { mode: r.mode, source: 'native-plugin' };
    if (r.hinge) fold.hinge = r.hinge;
    setFold(fold);
  };

  try {
    last = await Posture.getPosture();
  } catch {
    // Plugin call failed — fall through with the flat default.
  }
  apply();

  let removeListener = async () => {};
  try {
    const handle = await Posture.addListener('postureChange', (payload) => {
      last = payload;
      apply();
    });
    removeListener = handle.remove;
  } catch {
    // No listener available; the one-shot reading above still applied.
  }

  const onResize = () => apply();
  window.addEventListener('resize', onResize);

  return () => {
    void removeListener();
    window.removeEventListener('resize', onResize);
  };
}
