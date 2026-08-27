export interface SearchDocument {
  id: string;
  workspaceId: string;
  locale?: string;
  type: string;
  title?: string;
  text?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  fields: Record<string, string | string[] | number | boolean | undefined>;
  payload?: Record<string, unknown>;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "nin"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "range"
  | "exists";

export interface FilterSpec {
  field: string;
  op: FilterOperator;
  value?: string | number | boolean | Array<string | number>;
  min?: number | string;
  max?: number | string;
}

export interface SortSpec {
  field: string;
  dir: "asc" | "desc";
}

export interface SearchQuery {
  term?: string;
  filters: FilterSpec[];
  locale?: string;
  limit: number;
  offset: number;
  sort?: SortSpec[];
}

export interface SearchHit {
  id: string;
  doc: SearchDocument;
  score: number;
}

export interface SearchResult {
  total: number;
  hits: SearchHit[];
  offset: number;
  limit: number;
}

export interface SearchProvider {
  index(doc: SearchDocument): void | Promise<void>;
  remove(docId: string): void | Promise<void>;
  search(query: SearchQuery): SearchResult | Promise<SearchResult>;
}
