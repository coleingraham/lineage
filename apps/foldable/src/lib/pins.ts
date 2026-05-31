/** A pinned node, possibly from another tree — the seed for "new from context". */
export interface PinnedRef {
  treeId: string;
  nodeId: string;
}

const KEY = 'lineage-foldable:pins';

export function loadPins(): PinnedRef[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PinnedRef[]) : [];
  } catch {
    return [];
  }
}

export function savePins(pins: PinnedRef[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(pins));
}

export function samePin(a: PinnedRef, b: PinnedRef): boolean {
  return a.treeId === b.treeId && a.nodeId === b.nodeId;
}
