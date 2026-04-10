export type {
  ContextSource,
  Node,
  NodeType,
  Tree,
  SearchOptions,
  SearchResult,
  SemanticSearchOptions,
  SemanticSearchResult,
  Tag,
  TagCategory,
} from './types.js';
export { NODE_TYPES } from './types.js';
export type { NodeRepository } from './repository.js';
export type { EmbeddingProvider } from './embedding.js';
export type { Message, GenerationConfig, StreamChunk, StreamToken, LLMProvider } from './llm.js';
export { parseConfig, ConfigError } from './config.js';
export type { Config } from './config.js';
export { createRepository, createLlmProvider, createEmbeddingProvider } from './factory.js';
export { buildContext, assembleContext } from './context.js';
export type { BuildContextOptions } from './context.js';
export { stripThinking, extractThinking } from './content.js';
export { createNode } from './nodes.js';
export type { CreateNodeFields } from './nodes.js';

export { createEmbeddingJob } from './embeddingJob.js';
export type { EmbeddingJob, EmbeddingJobOptions } from './embeddingJob.js';

export const VERSION = '0.0.0';
