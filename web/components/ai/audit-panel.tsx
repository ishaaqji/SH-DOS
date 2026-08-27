"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { AI_AUDIT_EVENTS, eventLabel, type AiAuditEvent, type AiAuditPage } from "@/lib/ai";
import { pagerItems } from "@/lib/content";

export interface AuditPanelProps {
  audit: AiAuditPage | null;
}

function eventTone(event: string): "danger" | "warning" | "success" | "neutral" {
  if (event === "blocked" || event === "review_rejected" || event === "request_failed") return "danger";
  if (event === "flagged" || event === "review_required") return "warning";
  if (event === "allowed" || event === "review_approved" || event === "request_ok") return "success";
  return "neutral";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditPanel({ audit }: AuditPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const apply = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  const clearAll = () => {
    router.replace(pathname);
  };

  const hasQuery =
    searchParams.get("from") ||
    searchParams.get("to") ||
    searchParams.get("event") ||
    searchParams.get("provider") ||
    searchParams.get("model");

  const total = audit?.total ?? 0;
  const page = audit?.page ?? 1;
  const totalPages = audit?.totalPages ?? 0;

  return (
    <div className="audit-panel">
      <div className="content-filter-group audit-filters">
        <select
          className="select"
          value={searchParams.get("event") ?? ""}
          onChange={(e) => apply("event", e.target.value || null)}
          aria-label="Filter by event"
        >
          <option value="">All events</option>
          {AI_AUDIT_EVENTS.map((event) => (
            <option key={event} value={event}>
              {eventLabel(event)}
            </option>
          ))}
        </select>

        <input
          className="input audit-date-input"
          type="date"
          value={searchParams.get("from") ?? ""}
          onChange={(e) => apply("from", e.target.value || null)}
          aria-label="From date"
        />

        <input
          className="input audit-date-input"
          type="date"
          value={searchParams.get("to") ?? ""}
          onChange={(e) => apply("to", e.target.value || null)}
          aria-label="To date"
        />

        {hasQuery && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      <div className="audit-summary" aria-live="polite">
        {isPending ? (
          <span className="text-xs text-faint">Updating…</span>
        ) : (
          <span className="text-xs text-faint">
            {total} {total === 1 ? "event" : "events"} in this view
          </span>
        )}
      </div>

      {!audit ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="ai" size={22} />
          </span>
          <div className="empty-title">Audit trail unavailable</div>
          <p className="empty-desc">The AI audit feed could not be loaded for this workspace.</p>
        </div>
      ) : audit.items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="activity" size={22} />
          </span>
          <div className="empty-title">No events</div>
          <p className="empty-desc">
            {hasQuery
              ? "Nothing matched the current filters. Widen the date range or clear some filters."
              : "No AI requests have been recorded yet. Route or govern an AI request to see activity."}
          </p>
        </div>
      ) : (
        <div className="content-table-wrap">
          <table className="content-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Source</th>
                <th>Model</th>
                <th>Detail</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {audit.items.map((event: AiAuditEvent) => (
                <tr key={event.id}>
                  <td>
                    <Badge variant={eventTone(event.event)}>{eventLabel(event.event)}</Badge>
                  </td>
                  <td>
                    <span className="text-xs text-muted">{event.source}</span>
                  </td>
                  <td>
                    {event.model ? <span className="mono">{event.model}</span> : <span className="text-faint">—</span>}
                  </td>
                  <td>
                    {event.detail ? (
                      <span className="audit-detail">{event.detail}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td>
                    <time className="text-xs text-faint" dateTime={event.createdAt}>
                      {formatDateTime(event.createdAt)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="content-pagination">
          <nav className="content-pager" aria-label="Pagination">
            {pagerItems(page, totalPages).map((item, index, arr) => {
              const prev = arr[index - 1];
              return (
                <span key={item} className="content-pager-group">
                  {prev !== undefined && item - prev > 1 && <span className="content-pager-ellipsis">…</span>}
                  {item === page ? (
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
    </div>
  );
}
