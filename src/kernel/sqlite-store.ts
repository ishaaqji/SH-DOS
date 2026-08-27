import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ConflictError, NotFoundError } from "./errors";
import { now } from "./ids";
import type { Store, Storable } from "./store";

const DEFAULT_PATH = process.env.DURABLE_DB_PATH ?? ":memory:";

let sharedDb: DatabaseSync | undefined;

export function openDurableDb(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function getSharedDb(path = DEFAULT_PATH): DatabaseSync {
  if (!sharedDb) sharedDb = openDurableDb(path);
  return sharedDb;
}

export function closeSharedDb(): void {
  if (!sharedDb) return;
  try {
    sharedDb.close();
  } finally {
    sharedDb = undefined;
  }
}

export interface SqliteStoreOptions {
  db?: DatabaseSync;
  workspaceField?: string;
}

const PRIMARY_KEY_CONSTRAINT = 1555;

function isPrimaryKeyConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "errcode" in err &&
    (err as { errcode?: number }).errcode === PRIMARY_KEY_CONSTRAINT
  );
}

function workspaceIdOf(row: Storable & { workspaceId?: string }): string | null {
  return row.workspaceId ?? null;
}

export class SqliteStore<T extends Storable> implements Store<T> {
  private readonly table: string;
  private readonly db: DatabaseSync;

  constructor(name: string, options: SqliteStoreOptions = {}) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    this.table = `shdos_${normalized}`;
    this.db = options.db ?? getSharedDb();
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.table} (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    if (options.workspaceField) {
      this.db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${this.table}_workspace ON ${this.table}(workspace_id)`,
      );
    }
  }

  insert(row: T): T {
    const stored = { ...row } as T;
    if (!stored.createdAt) stored.createdAt = now();
    if (!stored.updatedAt) stored.updatedAt = now();
    const createdAt = stored.createdAt;
    const updatedAt = stored.updatedAt;
    try {
      this.db
        .prepare(
          `INSERT INTO ${this.table} (id, workspace_id, payload, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stored.id,
          workspaceIdOf(stored as T & { workspaceId?: string }),
          JSON.stringify(stored),
          createdAt,
          updatedAt,
          stored.deletedAt ?? null,
        );
    } catch (err) {
      if (isPrimaryKeyConflict(err)) throw new ConflictError(`Duplicate id ${stored.id}`);
      throw err;
    }
    return this.get(stored.id) as T;
  }

  update(id: string, patch: Partial<T>): T {
    const existing = this.require(id);
    const next = { ...existing, ...patch, id, updatedAt: now() } as T;
    this.db
      .prepare(
        `UPDATE ${this.table}
         SET payload = ?, workspace_id = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
      )
      .run(
        JSON.stringify(next),
        workspaceIdOf(next as T & { workspaceId?: string }),
        next.updatedAt,
        next.deletedAt ?? null,
        id,
      );
    return this.get(id) as T;
  }

  get(id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT payload, deleted_at FROM ${this.table} WHERE id = ?`)
      .get(id) as { payload?: string; deleted_at?: string | null } | undefined;
    if (!row || row.deleted_at) return undefined;
    return JSON.parse(row.payload as string) as T;
  }

  require(id: string): T {
    const row = this.get(id);
    if (!row) throw new NotFoundError(`Record ${id} not found`);
    return row;
  }

  softDelete(id: string): T {
    this.require(id);
    return this.update(id, { deletedAt: now() } as Partial<T>);
  }

  restore(id: string): T {
    const row = this.db
      .prepare(`SELECT payload FROM ${this.table} WHERE id = ?`)
      .get(id) as { payload?: string } | undefined;
    if (!row) throw new NotFoundError(`Record ${id} not found`);
    const next = { ...(JSON.parse(row.payload as string) as T), deletedAt: null, updatedAt: now() } as T;
    this.db
      .prepare(`UPDATE ${this.table} SET payload = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(next), next.updatedAt, id);
    return next;
  }

  list(): T[] {
    const rows = this.db
      .prepare(`SELECT payload FROM ${this.table} WHERE deleted_at IS NULL`)
      .all() as Array<{ payload: string }>;
    return rows.map((r) => JSON.parse(r.payload) as T);
  }

  find(predicate: (row: T) => boolean): T[] {
    return this.list().filter(predicate);
  }
}
