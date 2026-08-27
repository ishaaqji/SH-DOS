"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { contentTypeLabel, statusLabel, statusVariant } from "@/lib/status";
import { pagerItems } from "@/lib/content";
import { QUEUE_TABS, transitionLabel, canRunAction } from "@/lib/publishing";
import type { Content, ContentVersion, WorkflowAudit, WorkflowStatus } from "@/lib/types";

export interface PublishingQueueProps {
  items: Content[];
  total: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  query: URLSearchParams;
  workspaceId: string;
  permissions: {
    canSubmitForReview: boolean;
    canReview: boolean;
    canPublish: boolean;
    canSchedule: boolean;
  };
}

type AllowedTransitions = Record<WorkflowStatus, Array<{ to: WorkflowStatus; label: string; variant: "primary" | "secondary" | "danger" }>>;

const ALLOWED: AllowedTransitions = {
  draft: [{ to: "review", label: "submit_for_review", variant: "primary" }],
  review: [
    { to: "approved", label: "approve", variant: "primary" },
    { to: "draft", label: "request_changes", variant: "secondary" },
  ],
  approved: [
    { to: "published", label: "publish", variant: "primary" },
    { to: "draft", label: "unapprove", variant: "secondary" },
  ],
  published: [
    { to: "draft", label: "unpublish", variant: "secondary" },
    { to: "archived", label: "archive", variant: "danger" },
  ],
  archived: [{ to: "draft", label: "restore", variant: "secondary" }],
};

export function PublishingQueue({
  items,
  total,
  pagination,
  query,
  workspaceId,
  permissions,
}: PublishingQueueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Content | null>(null);
  const [historyFor, setHistoryFor] = useState<Content | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const apply = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };

  const runTransition = async (content: Content, to: WorkflowStatus) => {
    setError(null);
    setBanner(null);
    setBusyId(content.id);
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(content.id)}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Transition failed");
      setBanner(`"${content.title}" moved to ${statusLabel(to)}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const runScheduler = async () => {
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Scheduler failed");
      const published = data.published ?? [];
      setBanner(published.length > 0 ? `Published ${published.length} scheduled item(s)` : "No scheduled items were due");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="publishing-queue">
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      {banner && (
        <div className="publishing-banner" role="status">
          {banner}
        </div>
      )}

      <div className="publishing-toolbar">
        <div className="publishing-tabs" role="tablist" aria-label="Workflow stages">
          {QUEUE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              className={["publishing-tab", status === tab.value ? "publishing-tab-active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => apply("status", tab.value === "all" ? null : tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {permissions.canPublish && (
          <Button size="sm" variant="secondary" onClick={() => void runScheduler()}>
            <Icon name="clock" size={14} />
            Run scheduler
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="content" size={22} />
          </span>
          <div className="empty-title">No items in this view</div>
          <p className="empty-desc">Nothing matches the current stage. Try another tab or adjust filters.</p>
        </div>
      ) : (
        <div className="content-table-wrap">
          <table className="content-table publishing-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Updated</th>
                <th className="content-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const transitions = ALLOWED[item.status] ?? [];
                return (
                  <tr key={item.id}>
                    <td className="content-title">
                      <Link href={`/dashboard/content/${item.id}/edit`}>{item.title}</Link>
                      <span className="content-slug mono">{item.slug}</span>
                    </td>
                    <td>
                      <span className="content-type">{contentTypeLabel(item.type)}</span>
                    </td>
                    <td>
                      <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                      {item.scheduledAt && item.status !== "published" && (
                        <span className="publishing-scheduled-label">
                          <Icon name="clock" size={11} />
                          {formatScheduled(item.scheduledAt)}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.scheduledAt ? (
                        <time className="mono text-xs text-faint" dateTime={item.scheduledAt}>
                          {formatScheduled(item.scheduledAt)}
                        </time>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td>
                      <time className="text-xs text-faint" dateTime={item.updatedAt}>
                        {formatDate(item.updatedAt)}
                      </time>
                    </td>
                    <td className="content-actions">
                      <span className="content-row-actions">
                        {transitions.map((transition) =>
                          canRunAction(permissions, transition.label) ? (
                            <Button
                              key={transition.label}
                              size="sm"
                              variant={transition.variant}
                              disabled={busyId === item.id}
                              onClick={() => void runTransition(item, transition.to)}
                            >
                              {transitionLabel(transition.label)}
                            </Button>
                          ) : null,
                        )}
                        {permissions.canSchedule && item.status !== "published" && item.status !== "archived" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === item.id}
                            onClick={() => setScheduleFor(item)}
                          >
                            <Icon name="clock" size={13} />
                            Schedule
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === item.id}
                          onClick={() => setHistoryFor(item)}
                          aria-label={`Revision history for ${item.title}`}
                        >
                          <Icon name="activity" size={13} />
                          History
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="content-pagination">
          <span className="content-count">
            {total} {total === 1 ? "item" : "items"}
          </span>
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

      {scheduleFor && (
        <ScheduleDialog
          content={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onScheduled={() => {
            setScheduleFor(null);
            setBanner(`"${scheduleFor.title}" scheduled for publishing`);
            router.refresh();
          }}
        />
      )}

      {historyFor && (
        <RevisionHistory content={historyFor} workspaceId={workspaceId} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}

function ScheduleDialog({
  content,
  onClose,
  onScheduled,
}: {
  content: Content;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [value, setValue] = useState(content.scheduledAt?.slice(0, 16) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!value) {
      setError("Pick a date and time to schedule the publish.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(content.id)}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: content.workspaceId, scheduledAt: new Date(value).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Schedule failed");
      onScheduled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="media-modal-overlay" role="dialog" aria-modal="true" aria-label="Schedule publishing" onClick={onClose}>
      <div className="media-modal publishing-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-modal-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        <div className="publishing-dialog-body">
          <h3 className="media-detail-title">Schedule publishing</h3>
          <p className="text-sm text-muted">
            Set when <strong>{content.title}</strong> should be published. The scheduler will publish approved
            and draft items once the time arrives.
          </p>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <label className="field" htmlFor="schedule-at">
            <span className="field-label">Publish at</span>
            <input
              id="schedule-at"
              className="input"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <div className="publishing-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" loading={busy} onClick={() => void submit()}>
              <Icon name="clock" size={14} />
              Schedule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevisionHistory({
  content,
  workspaceId,
  onClose,
}: {
  content: Content;
  workspaceId: string;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [audit, setAudit] = useState<WorkflowAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [vRes, aRes] = await Promise.all([
          fetch(`/api/content/${encodeURIComponent(content.id)}/versions?workspaceId=${encodeURIComponent(workspaceId)}`),
          fetch(`/api/content/${encodeURIComponent(content.id)}/audit?workspaceId=${encodeURIComponent(workspaceId)}`),
        ]);
        const [vData, aData] = await Promise.all([vRes.json(), aRes.json()]);
        if (!vRes.ok) throw new Error(vData?.error?.message ?? "Failed to load versions");
        if (!aRes.ok) throw new Error(aData?.error?.message ?? "Failed to load audit");
        if (cancelled) return;
        setVersions(vData.versions ?? []);
        setAudit(aData.audit ?? []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content.id, workspaceId]);

  return (
    <div className="media-modal-overlay" role="dialog" aria-modal="true" aria-label="Revision history" onClick={onClose}>
      <div className="media-modal publishing-dialog publishing-dialog-wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-modal-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        <div className="publishing-dialog-body">
          <h3 className="media-detail-title">Revision history</h3>
          <p className="text-sm text-muted">
            <strong>{content.title}</strong> — versions and workflow activity.
          </p>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <div className="publishing-history-loading">Loading history…</div>
          ) : (
            <div className="publishing-history">
              <div className="publishing-history-col">
                <h4 className="publishing-history-title">Versions</h4>
                {versions.length === 0 ? (
                  <p className="text-xs text-faint">No versions recorded.</p>
                ) : (
                  <ol className="publishing-timeline">
                    {[...versions].reverse().map((version) => (
                      <li key={version.id} className="publishing-timeline-item">
                        <span className="publishing-timeline-dot" />
                        <div>
                          <div className="publishing-timeline-title">
                            v{version.versionNumber} · {version.title}
                          </div>
                          <div className="publishing-timeline-meta">
                            {version.changeSummary ?? "Updated"} · {version.changedBy ?? "System"} ·{" "}
                            {formatDateTime(version.createdAt)}
                          </div>
                          <Badge variant={statusVariant(version.status)}>{statusLabel(version.status)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="publishing-history-col">
                <h4 className="publishing-history-title">Workflow activity</h4>
                {audit.length === 0 ? (
                  <p className="text-xs text-faint">No workflow activity recorded.</p>
                ) : (
                  <ol className="publishing-timeline">
                    {[...audit].reverse().map((entry) => (
                      <li key={entry.id} className="publishing-timeline-item">
                        <span className="publishing-timeline-dot" />
                        <div>
                          <div className="publishing-timeline-title">
                            {entry.from ? statusLabel(entry.from) : "Created"} → {statusLabel(entry.to)}
                          </div>
                          <div className="publishing-timeline-meta">
                            {entry.note ? `${entry.note} · ` : ""}
                            {entry.actorId ? `${entry.actorId} · ` : ""}
                            {formatDateTime(entry.createdAt)}
                          </div>
                          <Badge variant={statusVariant(entry.to)}>{statusLabel(entry.to)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function formatScheduled(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
