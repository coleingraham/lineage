import type { Config } from './config.js';
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
