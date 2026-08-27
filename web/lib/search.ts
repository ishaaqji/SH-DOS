import type { ContentQuery } from "./content";

export function hasActiveSearch(query: ContentQuery): boolean {
  return Boolean(
    query.search ||
      query.type ||
      query.status ||
      query.locale ||
      query.category ||
      query.tag ||
      query.author,
  );
}

export function resultCountLabel(total: number): string {
  return `${total} ${total === 1 ? "result" : "results"}`;
}
