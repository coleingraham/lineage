import type { ContextSource, NodeRepository } from '@lineage/core';
import type { PinnedRef } from './pins.js';
import { buildNodeMap, pathToSummaryOrRoot } from './tree.js';
import { buildSummaryPrompt, threadText } from './aiPrompts.js';

/**
 * Resolve pinned nodes into context sources for a new tree, **forcing a summary
 * for any pin that isn't itself a summary** — mirroring the desktop
 * new-from-context flow:
 *   1. the pin is already a summary → use it as-is;
 *   2. it has an existing (non-deleted) summary child → reuse that;
 *   3. otherwise → generate a summary (of the pin's thread up to its lowest
 *      summary/root) and use the new summary node.
 *
 * `generate` is the on-device model; when it is null (AI unavailable) a
 * non-summary pin degrades to its raw node rather than blocking.
 */
export async function resolveContextSources(
  repo: NodeRepository,
  summarize: (treeId: string, parentId: string, content: string) => Promise<string>,
  refs: PinnedRef[],
  generate: ((prompt: string) => Promise<string | null>) | null,
): Promise<ContextSource[]> {
  const sources: ContextSource[] = [];

  for (const ref of refs) {
    let node;
    try {
      node = await repo.getNode(ref.nodeId);
    } catch {
      continue;
    }

    if (node.type === 'summary') {
      sources.push({ treeId: ref.treeId, nodeId: ref.nodeId });
      continue;
    }

    const treeNodes = await repo.getNodes(ref.treeId);
    const existingSummary = treeNodes.find(
      (n) => n.parentId === ref.nodeId && n.type === 'summary' && !n.isDeleted,
    );
    if (existingSummary) {
      sources.push({ treeId: ref.treeId, nodeId: existingSummary.nodeId });
      continue;
    }

    if (!generate) {
      sources.push({ treeId: ref.treeId, nodeId: ref.nodeId });
      continue;
    }

    const nodeMap = buildNodeMap(treeNodes.filter((n) => !n.isDeleted));
    const thread = threadText(pathToSummaryOrRoot(nodeMap, ref.nodeId));
    const summaryText = await generate(buildSummaryPrompt(thread));
    if (!summaryText) {
      sources.push({ treeId: ref.treeId, nodeId: ref.nodeId });
      continue;
    }
    const summaryId = await summarize(ref.treeId, ref.nodeId, summaryText);
    sources.push({ treeId: ref.treeId, nodeId: summaryId });
  }

  return sources;
}
