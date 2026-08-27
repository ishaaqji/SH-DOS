"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../ui/icons";
import type { Category, Language, Tag } from "@/lib/types";
import { SORT_OPTIONS, contentTypeOptions, statusOptions } from "@/lib/content";

export interface ContentFiltersProps {
  categories: Category[];
  tags: Tag[];
  languages: Language[];
}

export function ContentFilters({ categories, tags, languages }: ContentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    apply("search", search.trim() || null);
    searchRef.current?.blur();
  };

  const clearAll = () => {
    router.replace(pathname);
  };

  const hasFilters =
    searchParams.get("search") ||
    searchParams.get("type") ||
    searchParams.get("status") ||
    searchParams.get("category") ||
    searchParams.get("tag") ||
    searchParams.get("locale") ||
    searchParams.get("sort");

  return (
    <div className="content-filters">
      <form className="content-search" onSubmit={submitSearch} role="search">
        <Icon name="search" size={16} />
        <input
          ref={searchRef}
          className="input"
          type="search"
          placeholder="Search content…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search content"
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

        {languages.length > 0 && (
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
        )}

        <select
          className="select"
          value={searchParams.get("sort") ?? "-updatedAt"}
          onChange={(e) => apply("sort", e.target.value || null)}
          aria-label="Sort content"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
          Clear filters
        </button>
      )}
    </div>
  );
}
