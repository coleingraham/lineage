import { useState, useCallback, useEffect } from 'react';
import type { NodeRepository, Tag, TagCategory } from '@lineage/core';

export function useTagging(repo: NodeRepository | null) {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const refresh = useCallback(async () => {
    if (!repo) return;
    const [cats, allTags] = await Promise.all([repo.listCategories(), repo.listTags()]);
    setCategories(cats);
    setTags(allTags);
  }, [repo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCategory = useCallback(
    async (name: string, description = '') => {
      if (!repo) return;
      const category: TagCategory = {
        categoryId: crypto.randomUUID(),
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      await repo.createCategory(category);
      await refresh();
      return category;
    },
    [repo, refresh],
  );

  const updateCategory = useCallback(
    async (categoryId: string, fields: { name?: string; description?: string }) => {
      if (!repo) return;
      await repo.updateCategory(categoryId, fields);
      await refresh();
    },
    [repo, refresh],
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!repo) return;
      await repo.deleteCategory(categoryId);
      await refresh();
    },
    [repo, refresh],
  );

  const createTag = useCallback(
    async (categoryId: string, name: string, description = '') => {
      if (!repo) return;
      const tag: Tag = {
        tagId: crypto.randomUUID(),
        categoryId,
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      await repo.createTag(tag);
      await refresh();
      return tag;
    },
    [repo, refresh],
  );

  const updateTag = useCallback(
    async (tagId: string, fields: { name?: string; description?: string }) => {
      if (!repo) return;
      await repo.updateTag(tagId, fields);
      await refresh();
    },
    [repo, refresh],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      if (!repo) return;
      await repo.deleteTag(tagId);
      await refresh();
    },
    [repo, refresh],
  );

  const tagsForCategory = useCallback(
    (categoryId: string) => tags.filter((t) => t.categoryId === categoryId),
    [tags],
  );

  return {
    categories,
    tags,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    createTag,
    updateTag,
    deleteTag,
    tagsForCategory,
  };
}

export function useNodeTags(repo: NodeRepository | null, nodeId: string | null) {
  const [tags, setTags] = useState<Tag[]>([]);

  const refresh = useCallback(async () => {
    if (!repo || !nodeId) {
      setTags([]);
      return;
    }
    const result = await repo.getNodeTags(nodeId);
    setTags(result);
  }, [repo, nodeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tags, refresh };
}

export function useTreeTags(repo: NodeRepository | null, treeId: string | null) {
  const [tags, setTags] = useState<Tag[]>([]);

  const refresh = useCallback(async () => {
    if (!repo || !treeId) {
      setTags([]);
      return;
    }
    const result = await repo.getTreeTags(treeId);
    setTags(result);
  }, [repo, treeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tags, refresh };
}
