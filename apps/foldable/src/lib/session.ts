import { useCallback, useState } from 'react';

/**
 * Persisted UI session — the focused node and selected tree. Posture continuity
 * (B5): this survives fold/unfold transitions and app reloads, so a thought
 * jotted on the cover is still focused when the device is opened. The fold
 * *mode* itself is derived live from posture, never persisted, so it always
 * reflects the real device state on launch.
 */
export interface Session {
  selectedTreeId: string | null;
  focusedNodeId: string | null;
}

const KEY = 'lineage-foldable:session';

const EMPTY: Session = { selectedTreeId: null, focusedNodeId: null };

function load(): Session {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    return EMPTY;
  }
}

function save(session: Session): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(session));
}

/** A `useState`-like hook whose value is mirrored to localStorage. */
export function useSession(): [Session, (next: Partial<Session>) => void] {
  const [session, setSession] = useState<Session>(load);
  const update = useCallback((next: Partial<Session>) => {
    setSession((prev) => {
      const merged = { ...prev, ...next };
      save(merged);
      return merged;
    });
  }, []);
  return [session, update];
}
