import { buildFilter } from "../search/filters";
import type { SearchDocument, SearchProvider, SearchQuery, SearchResult } from "../search/types";
import { ConflictError } from "../kernel/errors";
import { now } from "../kernel/ids";
import type { Store, Storable } from "../kernel/store";

export function tokenize(...texts: string[]): string[] {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const token of (text ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length > 0) tokens.add(token);
    }
  }
  return [...tokens];
}

export interface SearchDocRecord extends Storable {
  workspaceId: string;
  doc: SearchDocument;
}

export class SearchIndexService implements SearchProvider {
  private docs = new Map<string, SearchDocument>();

  constructor(private backing?: Store<SearchDocRecord>) {
    if (backing) {
      for (const record of backing.list()) {
        if (record.doc?.id) this.docs.set(record.doc.id, record.doc);
      }
    }
  }

  index(doc: SearchDocument): void {
    this.docs.set(doc.id, { ...doc });
    if (this.backing) {
      const record: SearchDocRecord = {
        id: doc.id,
        workspaceId: doc.workspaceId,
        doc,
        createdAt: doc.createdAt ?? now(),
        updatedAt: doc.updatedAt ?? now(),
      };
      try {
        this.backing.insert(record);
      } catch (err) {
        if (err instanceof ConflictError) {
          this.backing.update(doc.id, { doc, updatedAt: now() });
        } else {
          throw err;
        }
      }
    }
  }

  remove(docId: string): void {
    this.docs.delete(docId);
    if (this.backing && this.backing.get(docId)) this.backing.softDelete(docId);
  }

  search(query: SearchQuery): SearchResult {
    let docs = [...this.docs.values()];
    const filter = buildFilter(query.filters);
    docs = docs.filter(filter);

    const tokens = tokenize(query.term ?? "");
    if (tokens.length > 0) {
      docs = docs.filter((doc) =>
        tokens.every((token) => tokenize(doc.title ?? "", doc.text ?? "").includes(token)),
      );
    }

    const total = docs.length;
    const hits = docs.slice(query.offset, query.offset + query.limit).map((doc) => ({
      id: doc.id,
      doc,
      score: 1,
    }));
    return { total, hits, offset: query.offset, limit: query.limit };
  }
}
