const ENV_VAR_PATTERN = /\$\{([^}]+)}/g;

const STORAGE_BACKENDS = ['memory', 'sqlite', 'postgres'] as const;
const LLM_PROVIDERS = ['anthropic', 'openai', 'bedrock', 'ollama'] as const;
const EMBEDDING_PROVIDERS = ['openai', 'bedrock', 'ollama'] as const;

type LlmProvider = (typeof LLM_PROVIDERS)[number];
type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

export type Config = {
  storage:
    | { backend: 'memory' }
    | { backend: 'sqlite'; path: string }
    | { backend: 'postgres'; url: string; poolSize: number };
  llm: {
    provider: LlmProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    region?: string;
  };
  embedding: {
    enabled: boolean;
    provider?: EmbeddingProvider;
    model?: string;
    dimensions?: number;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function resolveEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      throw new ConfigError(`Environment variable "${name}" is not set`);
    }
    return resolved;
  });
}

function resolveEnvVarsDeep(value: unknown): unknown {
  if (typeof value === 'string') return resolveEnvVars(value);
  if (Array.isArray(value)) return value.map(resolveEnvVarsDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVarsDeep(v)]),
    );
  }
  return value;
}

function requireString(obj: Record<string, unknown>, key: string, context: string): string {
  const val = obj[key];
  if (typeof val !== 'string') {
    throw new ConfigError(`${context}.${key} must be a string`);
  }
  return val;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'string') {
    throw new ConfigError(`${context}.${key} must be a string`);
  }
  return val;
}

function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'number') {
    throw new ConfigError(`${context}.${key} must be a number`);
  }
  return val;
}

function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  context: string,
): T {
  const val = obj[key];
  if (typeof val !== 'string' || !allowed.includes(val as T)) {
    throw new ConfigError(`${context}.${key} must be one of: ${allowed.join(', ')}`);
  }
  return val as T;
}

function optionalEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  context: string,
): T | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'string' || !allowed.includes(val as T)) {
    throw new ConfigError(`${context}.${key} must be one of: ${allowed.join(', ')}`);
  }
  return val as T;
}

function assertObject(val: unknown, context: string): Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    throw new ConfigError(`${context} must be an object`);
  }
  return val as Record<string, unknown>;
}

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new ConfigError(`Unknown key "${key}" in ${context}`);
    }
  }
}

function parseStorage(raw: Record<string, unknown>): Config['storage'] {
  const backend = requireEnum(raw, 'backend', STORAGE_BACKENDS, 'storage');
  switch (backend) {
    case 'memory':
      rejectUnknownKeys(raw, ['backend'], 'storage');
      return { backend };
    case 'sqlite': {
      rejectUnknownKeys(raw, ['backend', 'path'], 'storage');
      return { backend, path: requireString(raw, 'path', 'storage') };
    }
    case 'postgres': {
      rejectUnknownKeys(raw, ['backend', 'url', 'poolSize'], 'storage');
      const url = requireString(raw, 'url', 'storage');
      const poolSize = optionalNumber(raw, 'poolSize', 'storage') ?? 10;
      return { backend, url, poolSize };
    }
  }
}

function parseLlm(raw: Record<string, unknown>): Config['llm'] {
  rejectUnknownKeys(raw, ['provider', 'model', 'apiKey', 'baseUrl', 'region'], 'llm');
  return {
    provider: requireEnum(raw, 'provider', LLM_PROVIDERS, 'llm'),
    model: requireString(raw, 'model', 'llm'),
    apiKey: optionalString(raw, 'apiKey', 'llm'),
    baseUrl: optionalString(raw, 'baseUrl', 'llm'),
    region: optionalString(raw, 'region', 'llm'),
  };
}

function parseEmbedding(raw: Record<string, unknown>): Config['embedding'] {
  rejectUnknownKeys(raw, ['enabled', 'provider', 'model', 'dimensions'], 'embedding');
  const enabled = raw.enabled === undefined ? false : raw.enabled;
  if (typeof enabled !== 'boolean') {
    throw new ConfigError('embedding.enabled must be a boolean');
  }
  return {
    enabled,
    provider: optionalEnum(raw, 'provider', EMBEDDING_PROVIDERS, 'embedding'),
    model: optionalString(raw, 'model', 'embedding'),
    dimensions: optionalNumber(raw, 'dimensions', 'embedding'),
  };
}

export function parseConfig(raw: unknown): Config {
  const resolved = assertObject(resolveEnvVarsDeep(raw), 'config');
  rejectUnknownKeys(resolved, ['storage', 'llm', 'embedding'], 'config');

  return {
    storage: parseStorage(assertObject(resolved.storage, 'storage')),
    llm: parseLlm(assertObject(resolved.llm, 'llm')),
    embedding: parseEmbedding(assertObject(resolved.embedding, 'embedding')),
  };
}
