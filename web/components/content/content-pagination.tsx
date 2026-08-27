import Link from "next/link";
import { pagerItems } from "@/lib/content";

interface ContentPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  query: URLSearchParams;
}

export function ContentPagination({ page, totalPages, total, query }: ContentPaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="content-pagination">
        <span className="content-count">
          {total} {total === 1 ? "item" : "items"}
        </span>
      </div>
    );
  }

  const items = pagerItems(page, totalPages);

  return (
    <div className="content-pagination">
      <span className="content-count">
        {total} {total === 1 ? "item" : "items"}
      </span>
      <nav className="content-pager" aria-label="Pagination">
        <PagerLink page={page - 1} disabled={page <= 1} query={query} label="Previous" />
        {items.map((item, index) => {
          const prev = items[index - 1];
          return (
            <span key={item} className="content-pager-group">
              {prev !== undefined && item - prev > 1 && <span className="content-pager-ellipsis">…</span>}
              {item === page ? (
                <span className="content-pager-current" aria-current="page">
                  {item}
                </span>
              ) : (
                <PagerLink page={item} query={query} label={`Page ${item}`} />
              )}
            </span>
          );
        })}
        <PagerLink page={page + 1} disabled={page >= totalPages} query={query} label="Next" />
      </nav>
    </div>
  );
}

function PagerLink({
  page,
  query,
  label,
  disabled,
}: {
  page: number;
  query: URLSearchParams;
  label: string;
  disabled?: boolean;
}) {
  const next = new URLSearchParams(query.toString());
  next.set("page", String(page));
  if (disabled) {
    return (
      <span className="content-pager-item disabled" aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <Link className="content-pager-item" href={`/dashboard/content?${next.toString()}`}>
      {label}
    </Link>
  );
}
