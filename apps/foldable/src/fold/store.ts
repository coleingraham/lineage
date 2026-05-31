import { create } from 'zustand';
import { DEFAULT_FOLD_STATE, type FoldState } from './types.js';

interface FoldStore {
  fold: FoldState;
  setFold: (fold: FoldState) => void;
}

/**
 * The single consumption point for fold posture. Layout/interaction code reads
 * this via {@link useFoldState}; posture *sources* push into it via `setFold`.
 * Keeping this the only channel is what makes the posture source swappable.
 */
export const useFoldStore = create<FoldStore>((set) => ({
  fold: DEFAULT_FOLD_STATE,
  setFold: (fold) => set({ fold }),
}));

/** Read the current fold posture. */
export function useFoldState(): FoldState {
  return useFoldStore((s) => s.fold);
}
