import { useEffect, useState } from 'react';
import type { Node, NodeRepository, Tree } from '@lineage/core';

/** Load all trees, refreshing when `refreshKey` changes. */
export function useTreeList(repo: NodeRepository | null, refreshKey: number): Tree[] {
  const [trees, setTrees] = useState<Tree[]>([]);

  useEffect(() => {
    if (!repo) return;
    let active = true;
    repo.listTrees().then((t) => {
      if (active) setTrees(t);
    });
    return () => {
      active = false;
    };
  }, [repo, refreshKey]);

  return trees;
}

/**
 * Load the content of a tree's cross-tree context sources (pinned nodes injected
 * as background), so on-device AI can be grounded in them. Returns the joined
 * text and a count.
 */
export function useContextText(
  repo: NodeRepository | null,
  treeId: string | null,
  refreshKey: number,
): { text: string; count: number } {
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!repo || !treeId) {
      setText('');
      setCount(0);
      return;
    }
    let active = true;
    (async () => {
      try {
        const tree = await repo.getTree(treeId);
        const sources = tree.contextSources ?? [];
        if (sources.length === 0) {
          if (active) {
            setText('');
            setCount(0);
          }
          return;
        }
        const contents = await Promise.all(
          sources.map(async (s) => {
            try {
              return (await repo.getNode(s.nodeId)).content;
            } catch {
              return null;
            }
          }),
        );
        const resolved = contents.filter((c): c is string => !!c);
        if (active) {
          setText(resolved.join('\n\n'));
          setCount(resolved.length);
        }
      } catch {
        if (active) {
          setText('');
          setCount(0);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [repo, treeId, refreshKey]);

  return { text, count };
}

/** Load the (non-deleted) nodes of a tree, refreshing when `refreshKey` changes. */
export function useTreeData(
  repo: NodeRepository | null,
  treeId: string | null,
  refreshKey: number,
): { nodes: Node[]; loading: boolean } {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!repo || !treeId) {
      setNodes([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    repo.getNodes(treeId).then((all) => {
      if (!active) return;
      setNodes(all.filter((n) => !n.isDeleted));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [repo, treeId, refreshKey]);

  return { nodes, loading };
}
