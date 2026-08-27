import type { MediaReference } from "./types";

export type MediaKind = MediaReference["kind"];
export type MediaUsage = MediaReference["usage"];

export const MEDIA_KINDS: MediaKind[] = ["image", "file", "video", "audio"];

export const MEDIA_USAGES: MediaUsage[] = ["featured", "attachment"];

export function kindOptions(): Array<{ value: MediaKind; label: string }> {
  return MEDIA_KINDS.map((kind) => ({ value: kind, label: kind }));
}

export function usageOptions(): Array<{ value: MediaUsage; label: string }> {
  return MEDIA_USAGES.map((usage) => ({ value: usage, label: usage }));
}

export interface MediaQuery {
  page: number;
  pageSize: number;
  search?: string;
  kind?: MediaKind;
  usage?: MediaUsage;
}

export function parseMediaQuery(searchParams: URLSearchParams): MediaQuery {
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? "24", 10);
  const kind = searchParams.get("kind");
  const usage = searchParams.get("usage");
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(200, rawPageSize) : 24,
    search: searchParams.get("search") ?? undefined,
    kind: kind && MEDIA_KINDS.includes(kind as MediaKind) ? (kind as MediaKind) : undefined,
    usage: usage && MEDIA_USAGES.includes(usage as MediaUsage) ? (usage as MediaUsage) : undefined,
  };
}

export function mediaQueryParams(query: MediaQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== 24) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.kind) params.set("kind", query.kind);
  if (query.usage) params.set("usage", query.usage);
  return params;
}

export interface MediaPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function mediaPaginationInfo(total: number, page: number, pageSize: number): MediaPagination {
  const totalPages = total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages };
}

function matchesSearch(media: MediaReference, search?: string): boolean {
  if (!search) return true;
  const haystack = [
    media.alt,
    media.mimeType,
    media.kind,
    media.url,
    media.usage,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export function filterMedia(items: MediaReference[], query: MediaQuery): MediaReference[] {
  return items.filter((media) => {
    if (query.kind && media.kind !== query.kind) return false;
    if (query.usage && media.usage !== query.usage) return false;
    return matchesSearch(media, query.search);
  });
}

export function paginateMedia(items: MediaReference[], page: number, pageSize: number): MediaReference[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function mediaLabel(media: MediaReference): string {
  if (media.alt) return media.alt;
  const file = media.url.split("/").pop() ?? media.id;
  return decodeURIComponent(file);
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function mediaDimensions(media: MediaReference): string | undefined {
  if (media.width && media.height) return `${media.width} × ${media.height}`;
  return undefined;
}

export function mediaKindLabel(kind: MediaKind): string {
  return kind;
}
