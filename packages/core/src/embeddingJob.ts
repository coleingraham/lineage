import type { NodeRepository } from './repository.js';
import type { EmbeddingProvider } from './embedding.js';

export interface EmbeddingJobOptions {
  repository: NodeRepository;
  provider: EmbeddingProvider;
  /** Polling interval in milliseconds. Defaults to 5000. */
  intervalMs?: number;
  /** Max nodes to embed per tick. Defaults to 50. */
  batchSize?: number;
  /** Called when an error occurs during a tick. */
  onError?: (error: unknown) => void;
}

export interface EmbeddingJob {
  start(): void;
  stop(): void;
  /** Run a single tick manually (useful for testing). */
  tick(): Promise<number>;
}

export function createEmbeddingJob(options: EmbeddingJobOptions): EmbeddingJob {
  const {
    repository,
    provider,
    intervalMs = 5_000,
    batchSize = 50,
    onError,
  } = options;

  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick(): Promise<number> {
    const trees = await repository.listTrees();
    const candidates: { nodeId: string; content: string }[] = [];

    for (const tree of trees) {
      const nodes = await repository.getNodes(tree.treeId);
      for (const node of nodes) {
        if (node.isDeleted) continue;
        // Skip nodes already embedded with the current model
        if (node.embeddingModel === provider.modelId) continue;
        candidates.push({ nodeId: node.nodeId, content: node.content });
        if (candidates.length >= batchSize) break;
      }
      if (candidates.length >= batchSize) break;
    }

    if (candidates.length === 0) return 0;

    const texts = candidates.map((c) => c.content);
    const embeddings = await provider.embed(texts);

    for (let i = 0; i < candidates.length; i++) {
      await repository.updateNodeEmbedding(
        candidates[i].nodeId,
        embeddings[i],
        provider.modelId,
      );
    }

    return candidates.length;
  }

  function start(): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      tick().catch((err) => {
        if (onError) onError(err);
      });
    }, intervalMs);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, tick };
}
