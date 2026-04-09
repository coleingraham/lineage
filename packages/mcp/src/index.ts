#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { NodeRepository } from '@lineage/core';
import { createMcpServer } from './server.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function createRepo(): Promise<NodeRepository> {
  const configPath = getArg('--config');

  if (configPath) {
    // Config-based backend: supports sqlite, postgres, memory
    const { readFileSync } = await import('node:fs');
    const { parseConfig, createRepository } = await import('@lineage/core');
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const config = parseConfig(raw);
    return createRepository(config);
  }

  // Default: SQLite via --db flag or env var
  const dbPath = getArg('--db') ?? process.env.LINEAGE_DB ?? './lineage.db';
  const { default: Database } = await import('better-sqlite3');
  const { SqliteRepository } = await import('@lineage/adapter-sqlite');
  const db = new Database(dbPath);
  return new SqliteRepository(db);
}

const repo = await createRepo();
const server = createMcpServer(repo);

const transport = new StdioServerTransport();
await server.connect(transport);
