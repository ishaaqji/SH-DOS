import type { Content, ContentType, WorkflowStatus } from "./types";
import { CONTENT_TYPES, STATUS_ORDER } from "./status";

export interface ContentQuery {
  page: number;
  pageSize: number;
  sort: string;
  search?: string;
  type?: ContentType;
  status?: WorkflowStatus;
  category?: string;
  tag?: string;
  author?: string;
  locale?: string;
}

export const DEFAULT_PAGE_SIZE = 20;

export const SORT_OPTIONS = [
  { value: "-updatedAt", label: "Recently updated" },
  { value: "-createdAt", label: "Recently created" },
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
  { value: "status", label: "Status" },
  { value: "locale", label: "Locale" },
];

export function contentTypeOptions(): Array<{ value: ContentType; label: string }> {
  return CONTENT_TYPES.map((type) => ({
    value: type,
    label: type.replaceAll("_", " "),
  }));
}

export function statusOptions(): Array<{ value: WorkflowStatus; label: string }> {
  return STATUS_ORDER.map((status) => ({ value: status, label: status }));
}

function validContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

function validStatus(value: string): value is WorkflowStatus {
  return (STATUS_ORDER as readonly string[]).includes(value);
}

export function parseContentQuery(searchParams: URLSearchParams): ContentQuery {
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize:
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(100, rawPageSize)
        : DEFAULT_PAGE_SIZE,
    sort: searchParams.get("sort") ?? "-updatedAt",
    search: searchParams.get("search") ?? undefined,
    type: type && validContentType(type) ? type : undefined,
    status: status && validStatus(status) ? status : undefined,
    category: searchParams.get("category") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    author: searchParams.get("author") ?? undefined,
    locale: searchParams.get("locale") ?? undefined,
  };
}

export function contentQueryParams(query: ContentQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  if (query.sort !== "-updatedAt") params.set("sort", query.sort);
  if (query.search) params.set("search", query.search);
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.tag) params.set("tag", query.tag);
  if (query.author) params.set("author", query.author);
  if (query.locale) params.set("locale", query.locale);
  return params;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginationInfo(total: number, page: number, pageSize: number): Pagination {
  const totalPages = total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages };
}

export function pagerItems(current: number, totalPages: number, spread = 2): number[] {
  if (totalPages <= 1) return [];
  const set = new Set<number>();
  for (let i = Math.max(1, current - spread); i <= Math.min(totalPages, current + spread); i++) {
    set.add(i);
  }
  set.add(1);
  set.add(totalPages);
  return [...set].sort((a, b) => a - b);
}

export function isContent(value: Content): value is Content {
  return typeof value?.id === "string" && typeof value?.title === "string";
}
