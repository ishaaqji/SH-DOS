export interface PageQuery {
  page: number;
  pageSize: number;
  sort: string;
  filters: Record<string, unknown>;
  search?: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const SKIP_KEYS = new Set(["page", "pageSize", "sort", "search", "q"]);

export function parsePageQuery(
  params: Record<string, string | undefined>,
  allowedFilterKeys?: string[],
): PageQuery {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.pageSize ?? "20", 10) || 20));
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || SKIP_KEYS.has(key)) continue;
    if (allowedFilterKeys && !allowedFilterKeys.includes(key)) continue;
    filters[key] = value;
  }
  return {
    page,
    pageSize,
    sort: params.sort ?? "-updatedAt",
    filters,
    search: params.search ?? params.q,
  };
}

export function paginate<T>(items: T[], query: PageQuery): PageResult<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
  const start = (query.page - 1) * query.pageSize;
  const pageItems = items.slice(start, start + query.pageSize);
  return { items: pageItems, page: query.page, pageSize: query.pageSize, total, totalPages };
}

export function sortBy<T>(items: T[], sort: string, fields: ReadonlyArray<keyof T>): T[] {
  const descending = sort.startsWith("-");
  const key = (sort.replace(/^-/, "") as keyof T) ?? null;
  if (!key || !fields.includes(key)) return items;
  return [...items].sort((a, b) => {
    const av = a[key] as unknown as string | number;
    const bv = b[key] as unknown as string | number;
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return descending ? -cmp : cmp;
  });
}
