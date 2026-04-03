/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'wa-sqlite' {
  export const SQLITE_ROW: 100;
  export const SQLITE_DONE: 101;
  export const SQLITE_OK: 0;

  export interface SQLiteAPI {
    open_v2(filename: string, flags?: number, vfs?: string): Promise<number>;
    close(db: number): Promise<number>;
    exec(
      db: number,
      sql: string,
      callback?: (row: any[], columns: string[]) => void,
    ): Promise<number>;
    statements(db: number, sql: string): AsyncIterable<number>;
    bind(stmt: number, params: unknown[]): number;
    step(stmt: number): Promise<number>;
    column_names(stmt: number): string[];
    row(stmt: number): unknown[];
    reset(stmt: number): number;
    finalize(stmt: number): number;
    vfs_register(vfs: unknown, makeDefault?: boolean): number;
  }

  export function Factory(module: unknown): SQLiteAPI;
}

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  export default function SQLiteESMFactory(): Promise<unknown>;
}

declare module 'wa-sqlite/src/vfs/OPFSAnyContextVFS.js' {
  export class OPFSAnyContextVFS {
    static create(name: string, module: unknown): Promise<OPFSAnyContextVFS>;
  }
}
