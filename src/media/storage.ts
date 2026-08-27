import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface StoredObject {
  key: string;
  sizeBytes: number;
}

export interface Storage {
  put(key: string, data: Buffer, contentType?: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | undefined>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}

export class MemoryStorage implements Storage {
  private blobs = new Map<string, Buffer>();

  async put(key: string, data: Buffer, _contentType?: string): Promise<StoredObject> {
    this.blobs.set(key, Buffer.from(data));
    return { key, sizeBytes: data.length };
  }

  async get(key: string): Promise<Buffer | undefined> {
    return this.blobs.get(key);
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  url(key: string): string {
    return `/media/${key}`;
  }
}

export class DiskStorage implements Storage {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
  }

  private path(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<StoredObject> {
    const path = this.path(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return { key, sizeBytes: data.length };
  }

  async get(key: string): Promise<Buffer | undefined> {
    const path = this.path(key);
    if (!existsSync(path)) return undefined;
    return readFileSync(path);
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    if (existsSync(path)) unlinkSync(path);
  }

  url(key: string): string {
    return `/media/${key}`;
  }
}
