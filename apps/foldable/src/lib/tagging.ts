import type { NodeRepository } from '@lineage/core';

/** Find a tag category by name (case-insensitive), creating it if absent. */
export async function ensureCategory(repo: NodeRepository, name: string): Promise<string> {
  const categories = await repo.listCategories();
  const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.categoryId;
  const categoryId = crypto.randomUUID();
  await repo.createCategory({
    categoryId,
    name,
    description: 'AI-extracted topics',
    createdAt: new Date().toISOString(),
  });
  return categoryId;
}

/**
 * Apply named tags to a node within a category: reuse existing tags by name,
 * create the rest, then attach all of them to the node.
 */
export async function applyNamedTags(
  repo: NodeRepository,
  categoryId: string,
  nodeId: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;
  const existing = await repo.listTags(categoryId);
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.tagId]));
  const tagIds: string[] = [];

  for (const name of names) {
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      id = crypto.randomUUID();
      try {
        await repo.createTag({
          tagId: id,
          categoryId,
          name,
          description: '',
          createdAt: new Date().toISOString(),
        });
        byName.set(key, id);
      } catch {
        // Lost a race (UNIQUE(category, name)) — re-fetch the winner.
        const refreshed = await repo.listTags(categoryId);
        id = refreshed.find((t) => t.name.toLowerCase() === key)?.tagId;
      }
    }
    if (id) tagIds.push(id);
  }

  if (tagIds.length > 0) await repo.tagNode(nodeId, tagIds);
}
