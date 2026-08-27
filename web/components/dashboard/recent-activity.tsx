import Link from "next/link";
import { Card, CardHeader, CardBody } from "../ui/card";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { statusVariant } from "@/lib/status";
import type { ContentSummary } from "@/lib/types";

export function RecentActivity({
  items,
  workspaceId,
}: {
  items: ContentSummary[] | null;
  workspaceId: string;
}) {
  return (
    <Card className="panel">
      <CardHeader
        title="Recent activity"
        description="Latest content updates in this workspace."
        action={
          <Link href="/dashboard/content" className="panel-link">
            View all
            <Icon name="arrow-right" size={14} />
          </Link>
        }
      />
      <CardBody>
        {!Array.isArray(items) || items.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No activity yet"
            description="Content changes will appear here as soon as items are created or updated."
          />
        ) : (
          <ul className="activity-list">
            {items.map((item) => (
              <li key={item.id} className="activity-item">
                <span className="activity-dot" aria-hidden="true" />
                <div className="activity-main">
                  <div className="activity-title">{item.title}</div>
                  <div className="activity-meta">
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                    <span className="mono">{item.locale}</span>
                  </div>
                </div>
                <time className="activity-time mono" dateTime={item.updatedAt}>
                  {formatTime(item.updatedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: "clock" | "activity" | "users" | "server";
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty-title">{title}</div>
      <p className="empty-desc">{description}</p>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
