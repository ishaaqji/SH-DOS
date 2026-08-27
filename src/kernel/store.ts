import { ConflictError, NotFoundError } from "./errors";
import { now } from "./ids";

export interface Storable {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Store<T extends Storable> {
  insert(row: T): T;
  update(id: string, patch: Partial<T>): T;
  get(id: string): T | undefined;
  require(id: string): T;
  softDelete(id: string): T;
  restore(id: string): T;
  list(): T[];
  find(predicate: (row: T) => boolean): T[];
}

export class MemoryStore<T extends Storable> implements Store<T> {
  private rows = new Map<string, T>();

  insert(row: T): T {
    if (this.rows.has(row.id)) throw new ConflictError(`Duplicate id ${row.id}`);
    const stored = { ...row };
    if (!stored.createdAt) stored.createdAt = now();
    if (!stored.updatedAt) stored.updatedAt = now();
    this.rows.set(row.id, stored);
    return this.get(row.id) as T;
  }

  update(id: string, patch: Partial<T>): T {
    const existing = this.require(id);
    const next = { ...existing, ...patch, id, updatedAt: now() } as T;
    this.rows.set(id, next);
    return { ...next } as T;
  }

  get(id: string): T | undefined {
    const row = this.rows.get(id);
    if (!row || row.deletedAt) return undefined;
    return { ...row } as T;
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
    const row = this.rows.get(id);
    if (!row) throw new NotFoundError(`Record ${id} not found`);
    const next = { ...row, deletedAt: null, updatedAt: now() } as T;
    this.rows.set(id, next);
    return { ...next };
  }

  list(): T[] {
    return [...this.rows.values()]
      .filter((r) => !r.deletedAt)
      .map((r) => ({ ...r }));
  }

  find(predicate: (row: T) => boolean): T[] {
    return this.list().filter(predicate);
  }
}
