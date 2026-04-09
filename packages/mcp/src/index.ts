#!/usr/bin/env node
import Database from 'better-sqlite3';
import { SqliteRepository } from '@lineage/adapter-sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const dbPath = (() => {
  const idx = process.argv.indexOf('--db');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return process.env.LINEAGE_DB ?? './lineage.db';
})();

const db = new Database(dbPath);
const repo = new SqliteRepository(db);
const server = createMcpServer(repo);

const transport = new StdioServerTransport();
await server.connect(transport);
