#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { NodeRepository, LLMProvider } from '@lineage/core';
import { createMcpServer } from './server.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function init(): Promise<{ repo: NodeRepository; llm?: LLMProvider }> {
  const configPath = getArg('--config');

  if (configPath) {
    // Config-based backend: supports sqlite, postgres, memory + optional LLM
    const { readFileSync } = await import('node:fs');
    const { parseConfig, createRepository, createLlmProvider } = await import('@lineage/core');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const config = parseConfig(raw);
    const repo = await createRepository(config);
    const llm = await createLlmProvider(config);
    return { repo, llm };
  }

  // Default: SQLite via --db flag or env var, no LLM
  const dbPath = getArg('--db') ?? process.env.LINEAGE_DB ?? './lineage.db';
  const { default: Database } = await import('better-sqlite3');
  const { SqliteRepository } = await import('@lineage/adapter-sqlite');
  const db = new Database(dbPath);
  return { repo: new SqliteRepository(db) };
}

const { repo, llm } = await init();
const server = createMcpServer(repo, { llm });

const transport = new StdioServerTransport();
await server.connect(transport);
