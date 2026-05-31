import { useEffect, useState } from 'react';
import type { Node, NodeRepository, Tag, Tree } from '@lineage/core';

/** Load each node's tags into a `nodeId → Tag[]` map, refreshing on `refreshKey`. */
export function useNodeTags(
  repo: NodeRepository | null,
  nodes: Node[],
  refreshKey: number,
): Map<string, Tag[]> {
  const [map, setMap] = useState<Map<string, Tag[]>>(new Map());
  const ids = nodes.map((n) => n.nodeId).join(',');

  useEffect(() => {
    if (!repo || nodes.length === 0) {
      setMap(new Map());
      return;
    }
    let active = true;
    Promise.all(
      nodes.map(
        async (n) => [n.nodeId, await repo.getNodeTags(n.nodeId).catch(() => [])] as const,
      ),
    ).then((entries) => {
      if (active) setMap(new Map(entries));
    });
    return () => {
      active = false;
    };
    // `ids` captures the node set (avoids array-identity churn); refreshKey
    // forces a reload after tagging.
  }, [repo, ids, refreshKey]);

  return map;
}

/** Load all known tags (across categories), refreshing on `refreshKey`. */
export function useAllTags(repo: NodeRepository | null, refreshKey: number): Tag[] {
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    if (!repo) return;
    let active = true;
    repo
      .listTags()
      .then((t) => {
        if (active) setTags(t);
      })
      .catch(() => {
        if (active) setTags([]);
      });
    return () => {
      active = false;
    };
  }, [repo, refreshKey]);
  return tags;
}

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

/** A resolved cross-tree context source: where it comes from + its content. */
export interface ContextSourceInfo {
  treeId: string;
  nodeId: string;
  treeTitle: string;
  content: string;
}

export interface ContextData {
  /** Joined content for grounding AI prompts. */
  text: string;
  count: number;
  sources: ContextSourceInfo[];
}

/**
 * Load a tree's cross-tree context sources (pinned nodes injected as
 * background): each source's content and which tree it came from, plus the
 * joined text used to ground on-device AI.
 */
export function useContextText(
  repo: NodeRepository | null,
  treeId: string | null,
  refreshKey: number,
): ContextData {
  const [data, setData] = useState<ContextData>({ text: '', count: 0, sources: [] });

  useEffect(() => {
    if (!repo || !treeId) {
      setData({ text: '', count: 0, sources: [] });
      return;
    }
    let active = true;
    (async () => {
      try {
        const tree = await repo.getTree(treeId);
        const refs = tree.contextSources ?? [];
        if (refs.length === 0) {
          if (active) setData({ text: '', count: 0, sources: [] });
          return;
        }
        const titleCache = new Map<string, string>();
        const resolved = await Promise.all(
          refs.map(async (ref): Promise<ContextSourceInfo | null> => {
            try {
              const node = await repo.getNode(ref.nodeId);
              let treeTitle = titleCache.get(ref.treeId);
              if (treeTitle === undefined) {
                treeTitle = await repo
                  .getTree(ref.treeId)
                  .then((t) => t.title)
                  .catch(() => 'Untitled');
                titleCache.set(ref.treeId, treeTitle);
              }
              return { treeId: ref.treeId, nodeId: ref.nodeId, treeTitle, content: node.content };
            } catch {
              return null;
            }
          }),
        );
        const sources = resolved.filter((s): s is ContextSourceInfo => s !== null);
        if (active) {
          setData({
            text: sources.map((s) => s.content).join('\n\n'),
            count: sources.length,
            sources,
          });
        }
      } catch {
        if (active) setData({ text: '', count: 0, sources: [] });
      }
    })();
    return () => {
      active = false;
    };
  }, [repo, treeId, refreshKey]);

  return data;
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
