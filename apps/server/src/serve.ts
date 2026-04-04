import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import Database from 'better-sqlite3';
import { SqliteRepository } from '@lineage/adapter-sqlite';
import { OllamaProvider } from '@lineage/adapter-ollama';
import { createApp } from './index.js';

const model = process.env.OLLAMA_MODEL;
if (!model) {
  console.error('OLLAMA_MODEL env var is required (e.g. OLLAMA_MODEL=llama3.2)');
  process.exit(1);
}

const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const storagePath = process.env.STORAGE_PATH ?? './lineage.db';
const port = Number(process.env.PORT ?? 3000);

const db = new Database(storagePath);
const repo = new SqliteRepository(db);
const llm = new OllamaProvider({ model, baseURL });

const inner = createApp(repo, llm);

const app = new Hono();
app.use('*', cors());
app.route('/', inner);

console.log(`Lineage server listening on http://localhost:${port}`);
console.log(`  Storage: sqlite @ ${storagePath}`);
console.log(`  LLM: ollama/${model} @ ${baseURL}`);

serve({ fetch: app.fetch, port });
