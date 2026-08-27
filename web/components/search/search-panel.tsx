"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { contentTypeLabel, statusLabel, statusVariant } from "@/lib/status";
import { pagerItems, contentTypeOptions, statusOptions, DEFAULT_PAGE_SIZE } from "@/lib/content";
import { resultCountLabel } from "@/lib/search";
import type { Category, Content, Language, Tag } from "@/lib/types";

export interface SearchPanelProps {
  items: Content[];
  total: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  query: URLSearchParams;
  categories: Category[];
  tags: Tag[];
  languages: Language[];
  canOpen: boolean;
}

export function SearchPanel({
  items,
  total,
  pagination,
  query,
  categories,
  tags,
  languages,
  canOpen,
}: SearchPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const apply = useCallback(
    (key: string, value: string | null, options?: { debounced?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
      if (options?.debounced && debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [pathname, router, searchParams],
  );

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      apply("search", value.trim() || null);
    }, 350);
  };

  const clearAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    router.replace(pathname);
  };

  const hasQuery =
    searchParams.get("search") ||
    searchParams.get("type") ||
    searchParams.get("status") ||
    searchParams.get("category") ||
    searchParams.get("tag") ||
    searchParams.get("locale");

  const isLoading = isPending || search !== (searchParams.get("search") ?? "");

  return (
    <div className="search-panel">
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          apply("search", search.trim() || null);
        }}
      >
        <Icon name="search" size={18} />
        <input
          className="input"
          type="search"
          placeholder="Search content across all locales…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search content"
          autoFocus
        />
        {search && (
          <button
            type="button"
            className="content-search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
        {isLoading && (
          <span className="search-spinner" aria-label="Searching" role="status">
            <span className="spinner" aria-hidden="true" />
          </span>
        )}
      </form>

      <div className="content-filter-group search-filters">
        <select
          className="select"
          value={searchParams.get("type") ?? ""}
          onChange={(e) => apply("type", e.target.value || null)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {contentTypeOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => apply("status", e.target.value || null)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statusOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={searchParams.get("locale") ?? ""}
          onChange={(e) => apply("locale", e.target.value || null)}
          aria-label="Filter by locale"
        >
          <option value="">All locales</option>
          {languages.map((language) => (
            <option key={language.id} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={searchParams.get("category") ?? ""}
          onChange={(e) => apply("category", e.target.value || null)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={searchParams.get("tag") ?? ""}
          onChange={(e) => apply("tag", e.target.value || null)}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>

        {hasQuery && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      <div className="search-summary" aria-live="polite">
        {hasQuery && !isLoading && <span>{resultCountLabel(total)}</span>}
      </div>

      {!hasQuery ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="search" size={22} />
          </span>
          <div className="empty-title">Search across your content</div>
          <p className="empty-desc">
            Enter a query above or pick a filter to find content in any locale and status.
          </p>
        </div>
      ) : isLoading ? (
        <div className="empty-state" role="status">
          <span className="search-spinner search-spinner-large" aria-label="Searching">
            <span className="spinner" aria-hidden="true" />
          </span>
          <div className="empty-title">Searching…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="search" size={22} />
          </span>
          <div className="empty-title">No results</div>
          <p className="empty-desc">Nothing matched your query. Try different terms or clear some filters.</p>
        </div>
      ) : (
        <div className="search-results">
          {items.map((item) => (
            <article key={item.id} className="search-card">
              <div className="search-card-head">
                <h3 className="search-card-title">
                  {canOpen ? (
                    <Link href={`/dashboard/content/${item.id}/edit`}>{item.title}</Link>
                  ) : (
                    item.title
                  )}
                </h3>
                <span className="search-card-type">{contentTypeLabel(item.type)}</span>
              </div>
              {item.excerpt && <p className="search-card-excerpt">{item.excerpt}</p>}
              <div className="search-card-meta">
                <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                <span className="search-card-locale">{item.locale}</span>
                {canOpen && (
                  <Link
                    href={`/dashboard/content/${item.id}/edit`}
                    className="search-card-open"
                    aria-label={`Open ${item.title} in the content manager`}
                  >
                    Open in editor
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {hasQuery && pagination.totalPages > 1 && (
        <div className="content-pagination">
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
        </div>
      )}

      {total > DEFAULT_PAGE_SIZE && pagination.page < pagination.totalPages && (
        <div className="search-more">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply("page", String(pagination.page + 1))}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
