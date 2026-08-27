"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../ui/icons";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { MediaCard } from "./media-card";
import {
  filterMedia,
  paginateMedia,
  mediaPaginationInfo,
  mediaQueryParams,
  parseMediaQuery,
  kindOptions,
  usageOptions,
  mediaLabel,
  formatBytes,
  mediaDimensions,
  type MediaQuery,
} from "@/lib/media";
import { pagerItems } from "@/lib/content";
import type { MediaReference } from "@/lib/types";

export interface MediaLibraryProps {
  items: MediaReference[];
  workspaceId: string;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const PAGE_SIZE = 24;

export function MediaLibrary({ items, workspaceId, canUpload, canEdit, canDelete }: MediaLibraryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo(() => parseMediaQuery(searchParams), [searchParams]);
  const [search, setSearch] = useState(query.search ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<MediaReference | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearch(query.search ?? "");
  }, [query.search]);

  const apply = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const filtered = useMemo(() => filterMedia(items, query), [items, query]);
  const pagination = useMemo(
    () => mediaPaginationInfo(filtered.length, query.page, PAGE_SIZE),
    [filtered.length, query.page],
  );
  const pageItems = useMemo(
    () => paginateMedia(filtered, pagination.page, PAGE_SIZE),
    [filtered, pagination.page],
  );

  const selectedIds = useMemo(() => [...selected], [selected]);
  const allSelected = pageItems.length > 0 && pageItems.every((item) => selected.has(item.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach((item) => next.delete(item.id));
      } else {
        pageItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = () => router.refresh();

  const handleUpload = async (file: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("workspaceId", workspaceId);
      form.set("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
      setSelected(new Set());
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/media/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Delete failed");
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (preview && ids.includes(preview.id)) setPreview(null);
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMetadata = async (mediaId: string, patch: { alt?: string; usage?: "featured" | "attachment" }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Save failed");
      setPreview(data.media);
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReplace = async (mediaId: string, file: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("workspaceId", workspaceId);
      form.set("file", file);
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/replace`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Replace failed");
      setPreview(data.media);
      refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  return (
    <div className="media-library">
      <div className="content-filters media-toolbar">
        <form
          className="content-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply("search", search.trim() || null);
            searchRef.current?.blur();
          }}
        >
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="Search media…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search media"
          />
          {search && (
            <button
              type="button"
              className="content-search-clear"
              onClick={() => {
                setSearch("");
                apply("search", null);
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </form>

        <div className="content-filter-group">
          <select
            className="select"
            value={query.kind ?? ""}
            onChange={(e) => apply("kind", e.target.value || null)}
            aria-label="Filter by kind"
          >
            <option value="">All kinds</option>
            {kindOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={query.usage ?? ""}
            onChange={(e) => apply("usage", e.target.value || null)}
            aria-label="Filter by usage"
          >
            <option value="">All usage</option>
            {usageOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {canUpload && (
          <div className="media-upload">
            <input
              ref={fileInputRef}
              type="file"
              className="media-file-input"
              accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,application/pdf,audio/mpeg,audio/wav,video/mp4"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
              aria-label="Upload media"
            />
            <Button size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={14} />
              Upload
            </Button>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="content-bulkbar">
          <span className="content-bulkcount">{selectedIds.length} selected</span>
          <span className="content-bulkactions">
            {canDelete && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete ${selectedIds.length} item(s)?`)) void runDelete(selectedIds);
                }}
              >
                Delete
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </span>
        </div>
      )}

      {pageItems.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="media" size={22} />
          </span>
          <div className="empty-title">No media found</div>
          <p className="empty-desc">
            {items.length === 0
              ? "No media has been uploaded to this workspace yet."
              : "No items match the current filters. Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="media-grid" aria-label="Media grid">
            {pageItems.map((media) => (
              <MediaCard
                key={media.id}
                media={media}
                selected={selected.has(media.id)}
                onToggle={() => toggleOne(media.id)}
                onOpen={() => setPreview(media)}
              />
            ))}
          </div>

          <div className="media-grid-footer">
            <div className="content-pagination">
              <span className="content-count">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </span>
              {pagination.totalPages > 1 && (
                <nav className="content-pager" aria-label="Pagination">
                  {pagerItems(pagination.page, pagination.totalPages).map((item, index, arr) => {
                    const prev = arr[index - 1];
                    return (
                      <span key={item} className="content-pager-group">
                        {prev !== undefined && item - prev > 1 && <span className="content-pager-ellipsis">…</span>}
                        {item === pagination.page ? (
                          <span className="content-pager-current" aria-current="page">
                            {item}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="content-pager-item"
                            onClick={() => apply("page", String(item))}
                            aria-label={`Page ${item}`}
                          >
                            {item}
                          </button>
                        )}
                      </span>
                    );
                  })}
                </nav>
              )}
            </div>
          </div>
        </>
      )}

      {preview && (
        <MediaPreview
          media={preview}
          canEdit={canEdit}
          canDelete={canDelete}
          busy={busy}
          onClose={() => setPreview(null)}
          onSave={(patch) => void handleSaveMetadata(preview.id, patch)}
          onReplaceFile={(file) => void handleReplace(preview.id, file)}
          onDelete={() => {
            if (window.confirm(`Delete "${mediaLabel(preview)}"?`)) void runDelete([preview.id]);
          }}
          replaceInputRef={replaceInputRef}
        />
      )}
    </div>
  );
}

function MediaPreview({
  media,
  canEdit,
  canDelete,
  busy,
  onClose,
  onSave,
  onReplaceFile,
  onDelete,
  replaceInputRef,
}: {
  media: MediaReference;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { alt?: string; usage?: "featured" | "attachment" }) => void;
  onReplaceFile: (file: File) => void;
  onDelete: () => void;
  replaceInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [alt, setAlt] = useState(media.alt ?? "");
  const [usage, setUsage] = useState<"featured" | "attachment">(media.usage);

  return (
    <div className="media-modal-overlay" role="dialog" aria-modal="true" aria-label={mediaLabel(media)} onClick={onClose}>
      <div className="media-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-modal-close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
        <div className="media-modal-body">
          <div className="media-preview-pane">
            {media.kind === "image" ? (
              <img src={media.url} alt={media.alt ?? ""} className="media-preview-img" />
            ) : (
              <div className="media-preview-icon">
                <Icon name={media.kind === "video" ? "media" : media.kind === "audio" ? "activity" : "file"} size={48} />
                <span className="text-xs text-faint">{media.kind}</span>
              </div>
            )}
          </div>
          <div className="media-detail-pane">
            <div className="media-detail-title">{mediaLabel(media)}</div>
            <div className="media-detail-id mono">{media.id}</div>

            <div className="media-detail-section">
              <span className="media-detail-label">Details</span>
              <dl className="media-detail-list">
                <dt>Kind</dt>
                <dd>
                  <Badge variant="neutral">{media.kind}</Badge>
                </dd>
                <dt>MIME type</dt>
                <dd className="mono">{media.mimeType ?? "—"}</dd>
                <dt>Size</dt>
                <dd>{formatBytes(media.sizeBytes)}</dd>
                {mediaDimensions(media) && (
                  <>
                    <dt>Dimensions</dt>
                    <dd>{mediaDimensions(media)}</dd>
                  </>
                )}
                <dt>Usage</dt>
                <dd>{media.usage}</dd>
                <dt>Uploaded</dt>
                <dd>
                  <time className="text-xs text-faint" dateTime={media.createdAt}>
                    {formatDate(media.createdAt)}
                  </time>
                </dd>
              </dl>
            </div>

            {canEdit && (
              <form
                className="media-detail-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSave({ alt, usage });
                }}
              >
                <span className="media-detail-label">Metadata</span>
                <label className="field">
                  <label className="field-label" htmlFor="media-alt">
                    Alt text
                  </label>
                  <input
                    id="media-alt"
                    className="input"
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                    placeholder="Describe this media"
                  />
                </label>
                <label className="field">
                  <label className="field-label" htmlFor="media-usage">
                    Usage
                  </label>
                  <select
                    id="media-usage"
                    className="select"
                    value={usage}
                    onChange={(e) => setUsage(e.target.value as "featured" | "attachment")}
                  >
                    {usageOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button size="sm" variant="secondary" loading={busy} disabled={busy}>
                  Save metadata
                </Button>
              </form>
            )}

            {canEdit && (
              <div className="media-detail-section">
                <span className="media-detail-label">Replace file</span>
                <input
                  ref={replaceInputRef}
                  type="file"
                  className="media-file-input"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,application/pdf,audio/mpeg,audio/wav,video/mp4"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onReplaceFile(file);
                  }}
                  aria-label="Replace media file"
                />
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => replaceInputRef.current?.click()}>
                  Choose replacement
                </Button>
              </div>
            )}

            {canDelete && (
              <div className="media-detail-section">
                <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
                  Delete media
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
