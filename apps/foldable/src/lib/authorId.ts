const KEY = 'lineage-foldable:authorId';

/**
 * A stable local author identifier for this install. Monologue nodes are
 * author-role human nodes (no paired AI turn); stamping `author` keeps the door
 * open to multi-author trees later without changing the model.
 */
export function getAuthorId(): string {
  if (typeof localStorage === 'undefined') return 'local-author';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `author-${crypto.randomUUID()}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
