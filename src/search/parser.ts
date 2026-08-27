import type { FilterSpec, SearchQuery, SortSpec } from "./types";

export interface ParsedQuery {
  terms: string[];
  filters: FilterSpec[];
  excluded: string[];
}

export function parseQuery(input: string | undefined): ParsedQuery {
  const terms: string[] = [];
  const filters: FilterSpec[] = [];
  const excluded: string[] = [];
  for (const raw of (input ?? "").trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith("-")) {
      excluded.push(raw.slice(1).toLowerCase());
      continue;
    }
    const match = raw.match(/^([\w.]+):(.+)$/);
    if (match) {
      const [, field, value] = match;
      if (field && value) filters.push({ field, op: "eq", value });
      continue;
    }
    terms.push(raw.toLowerCase());
  }
  return { terms, filters, excluded };
}

export interface BuildQueryOptions {
  locale?: string;
  limit?: number;
  offset?: number;
  sort?: SortSpec[];
  filters?: FilterSpec[];
}

export function buildQuery(
  input: string | undefined,
  options: BuildQueryOptions = {},
): SearchQuery {
  const parsed = parseQuery(input);
  const filters: FilterSpec[] = [...parsed.filters];
  if (options.locale) filters.push({ field: "locale", op: "eq", value: options.locale });
  if (options.filters) filters.push(...options.filters);
  return {
    term: parsed.terms.join(" "),
    filters,
    locale: options.locale,
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
    sort: options.sort,
  };
}
