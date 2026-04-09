import type { Config } from './config.js';
import type { LLMProvider } from './llm.js';
import type { NodeRepository } from './repository.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(specifier: string): Promise<any> {
  return import(specifier);
}

export async function createRepository(config: Config): Promise<NodeRepository> {
  switch (config.storage.backend) {
    case 'memory': {
      const { InMemoryRepository } = (await load('@lineage/adapter-sqlite')) as {
        InMemoryRepository: new () => NodeRepository;
      };
      return new InMemoryRepository();
    }
    case 'sqlite': {
      const { default: Database } = (await load('better-sqlite3')) as {
        default: new (path: string) => unknown;
      };
      const { SqliteRepository } = (await load('@lineage/adapter-sqlite')) as {
        SqliteRepository: new (db: unknown) => NodeRepository;
      };
      return new SqliteRepository(new Database(config.storage.path));
    }
    case 'postgres': {
      const { default: postgres } = (await load('postgres')) as {
        default: (url: string, options: { max: number }) => unknown;
      };
      const { PostgresRepository } = (await load('@lineage/adapter-postgres')) as {
        PostgresRepository: new (sql: unknown) => NodeRepository & { migrate(): Promise<void> };
      };
      const sql = postgres(config.storage.url, { max: config.storage.poolSize });
      const repo = new PostgresRepository(sql);
      await repo.migrate();
      return repo;
    }
  }
}

export async function createLlmProvider(config: Config): Promise<LLMProvider> {
  const { provider, model, apiKey, baseUrl } = config.llm;
  switch (provider) {
    case 'ollama': {
      const { OllamaProvider } = (await load('@lineage/adapter-ollama')) as {
        OllamaProvider: new (opts: { model: string; baseURL?: string }) => LLMProvider;
      };
      return new OllamaProvider({ model, ...(baseUrl && { baseURL: baseUrl }) });
    }
    case 'openai': {
      const { OpenAIProvider } = (await load('@lineage/adapter-openai')) as {
        OpenAIProvider: new (opts: {
          apiKey: string;
          model: string;
          baseURL?: string;
        }) => LLMProvider;
      };
      if (!apiKey) throw new Error('llm.apiKey is required for OpenAI provider');
      return new OpenAIProvider({ apiKey, model, ...(baseUrl && { baseURL: baseUrl }) });
    }
    case 'anthropic': {
      const { AnthropicProvider } = (await load('@lineage/adapter-anthropic')) as {
        AnthropicProvider: new (opts: {
          apiKey: string;
          model: string;
          baseURL?: string;
        }) => LLMProvider;
      };
      if (!apiKey) throw new Error('llm.apiKey is required for Anthropic provider');
      return new AnthropicProvider({ apiKey, model, ...(baseUrl && { baseURL: baseUrl }) });
    }
    case 'bedrock': {
      const mod = (await load('@lineage/adapter-bedrock')) as {
        BedrockProvider?: new (opts: { model: string; region?: string }) => LLMProvider;
      };
      if (!mod.BedrockProvider) throw new Error('Bedrock adapter is not yet implemented');
      return new mod.BedrockProvider({
        model,
        ...(config.llm.region && { region: config.llm.region }),
      });
    }
  }
}
