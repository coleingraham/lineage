import type { CrossTreeRef, Node, NodeRepository, Tree } from '@lineage/core';
import { Capacitor } from '@capacitor/core';

export interface BackupTree {
  tree: Tree;
  nodes: Node[];
  crossTreeRefs: CrossTreeRef[];
}

/**
 * A portable, repo-agnostic snapshot of all monologues. Built from the
 * `NodeRepository` interface alone, so it works on both the on-device Capacitor
 * adapter and the browser dev fallback. This is the data-sovereignty escape
 * hatch — the user can export and keep their own copy.
 */
export interface BackupDoc {
  format: 'lineage-foldable-backup';
  version: 1;
  exportedAt: string;
  trees: BackupTree[];
}

/** Read every tree (with its nodes and owned cross-tree refs) into a backup doc. */
export async function buildBackup(repo: NodeRepository, exportedAt: string): Promise<BackupDoc> {
  const trees = await repo.listTrees();
  const out: BackupTree[] = [];
  for (const tree of trees) {
    const [nodes, crossTreeRefs] = await Promise.all([
      repo.getNodes(tree.treeId),
      repo.getCrossTreeRefs({ fromTreeId: tree.treeId }),
    ]);
    out.push({ tree, nodes, crossTreeRefs });
  }
  return { format: 'lineage-foldable-backup', version: 1, exportedAt, trees: out };
}

/**
 * Hand the serialized backup to the user:
 * - **native** — write a file and open the OS share sheet (save to Drive, send, …)
 * - **web/dev** — trigger a file download
 */
export async function deliverBackup(json: string, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: 'Lineage monologues backup',
      url: written.uri,
      dialogTitle: 'Back up monologues',
    });
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build, serialize, name (by date), and deliver a full backup. */
export async function exportBackup(repo: NodeRepository, now: Date): Promise<void> {
  const doc = await buildBackup(repo, now.toISOString());
  const json = JSON.stringify(doc, null, 2);
  const filename = `lineage-monologues-${now.toISOString().slice(0, 10)}.json`;
  await deliverBackup(json, filename);
}
