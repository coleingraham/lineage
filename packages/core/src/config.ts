import { z } from 'zod';

const ENV_VAR_PATTERN = /\$\{([^}]+)}/g;

function resolveEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      throw new Error(`Environment variable "${name}" is not set`);
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

export const ConfigSchema = z
  .object({
    storage: z.discriminatedUnion('backend', [
      z.object({ backend: z.literal('memory') }),
      z.object({ backend: z.literal('sqlite'), path: z.string() }),
      z.object({
        backend: z.literal('postgres'),
        url: z.string(),
        poolSize: z.number().default(10),
      }),
    ]),
    llm: z.object({
      provider: z.enum(['anthropic', 'openai', 'bedrock', 'ollama']),
      model: z.string(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      region: z.string().optional(),
    }),
    embedding: z.object({
      enabled: z.boolean().default(false),
      provider: z.enum(['openai', 'bedrock', 'ollama']).optional(),
      model: z.string().optional(),
      dimensions: z.number().optional(),
    }),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  const resolved = resolveEnvVarsDeep(raw);
  return ConfigSchema.parse(resolved);
}
