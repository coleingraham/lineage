import { useCallback, useState } from 'react';
import { loadPins, savePins, samePin, type PinnedRef } from '../lib/pins.js';

export interface Pins {
  pins: PinnedRef[];
  isPinned: (treeId: string, nodeId: string) => boolean;
  toggle: (ref: PinnedRef) => void;
  remove: (ref: PinnedRef) => void;
  clear: () => void;
}

/** Pinned nodes (cross-tree), persisted to localStorage — feeds new-from-context. */
export function usePins(): Pins {
  const [pins, setPins] = useState<PinnedRef[]>(loadPins);

  const update = useCallback((next: PinnedRef[]) => {
    savePins(next);
    setPins(next);
  }, []);

  const isPinned = useCallback(
    (treeId: string, nodeId: string) => pins.some((p) => samePin(p, { treeId, nodeId })),
    [pins],
  );

  const toggle = useCallback(
    (ref: PinnedRef) =>
      setPins((prev) => {
        const next = prev.some((p) => samePin(p, ref))
          ? prev.filter((p) => !samePin(p, ref))
          : [...prev, ref];
        savePins(next);
        return next;
      }),
    [],
  );

  const remove = useCallback(
    (ref: PinnedRef) =>
      setPins((prev) => {
        const next = prev.filter((p) => !samePin(p, ref));
        savePins(next);
        return next;
      }),
    [],
  );

  const clear = useCallback(() => update([]), [update]);

  return { pins, isPinned, toggle, remove, clear };
}
