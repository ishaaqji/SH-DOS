"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { statusVariant, contentTypeLabel, statusLabel } from "@/lib/status";
import type { Content } from "@/lib/types";

export interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

interface ContentTableProps {
  items: Content[];
  workspaceId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onBulkDone?: (results: BulkResult[]) => void;
}

export function ContentTable({
  items,
  workspaceId,
  canCreate,
  canEdit,
  canDelete,
  onBulkDone,
}: ContentTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach((item) => next.delete(item.id));
      } else {
        items.forEach((item) => next.add(item.id));
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

  const runBulk = async (action: "delete" | "transition", to?: string) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/content/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action,
          ids: selectedIds,
          to: action === "transition" ? to : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Bulk action failed");
      setSelected(new Set());
      onBulkDone?.(data.results);
      router.refresh();
    } catch (err) {
      onBulkDone?.([{ id: "", ok: false, error: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  const runSingleDelete = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Delete failed");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      onBulkDone?.([{ id, ok: true }]);
      router.refresh();
    } catch (err) {
      onBulkDone?.([{ id, ok: false, error: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content-table-wrap">
      {selectedIds.length > 0 && (
        <div className="content-bulkbar">
          <span className="content-bulkcount">
            {selectedIds.length} selected
          </span>
          <span className="content-bulkactions">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => runBulk("transition", "published")}
            >
              Publish
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => runBulk("transition", "archived")}
            >
              Archive
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete ${selectedIds.length} item(s)?`)) runBulk("delete");
                }}
              >
                Delete
              </Button>
            )}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="content" size={22} />
          </span>
          <div className="empty-title">No content found</div>
          <p className="empty-desc">
            No items match the current filters. Try adjusting your search or filters, or create a new item.
          </p>
          {canCreate && (
            <Link href="/dashboard/content/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.75rem" }}>
              <Icon name="plus" size={14} />
              New content
            </Link>
          )}
        </div>
      ) : (
        <table className="content-table">
          <thead>
            <tr>
              <th className="content-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Locale</th>
              <th>Updated</th>
              <th className="content-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={selected.has(item.id) ? "row-selected" : ""}>
                <td className="content-check">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    aria-label={`Select ${item.title}`}
                  />
                </td>
                <td className="content-title">
                  {canEdit ? (
                    <Link href={`/dashboard/content/${item.id}/edit`}>{item.title}</Link>
                  ) : (
                    item.title
                  )}
                  <span className="content-slug mono">{item.slug}</span>
                </td>
                <td>
                  <span className="content-type">{contentTypeLabel(item.type)}</span>
                </td>
                <td>
                  <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                </td>
                <td>
                  <span className="mono">{item.locale}</span>
                </td>
                <td>
                  <time className="text-xs text-faint" dateTime={item.updatedAt}>
                    {formatDate(item.updatedAt)}
                  </time>
                </td>
                <td className="content-actions">
                  <span className="content-row-actions">
                    {canEdit && (
                      <Link
                        href={`/dashboard/content/${item.id}/edit`}
                        className="btn btn-ghost btn-sm"
                        aria-label={`Edit ${item.title}`}
                      >
                        <Icon name="settings" size={14} />
                      </Link>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm content-delete"
                        aria-label={`Delete ${item.title}`}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete "${item.title}"?`)) {
                            void runSingleDelete(item.id);
                          }
                        }}
                      >
                        <Icon name="logout" size={14} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
