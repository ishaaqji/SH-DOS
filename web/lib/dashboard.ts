import type { ApiClient } from "./api";
import type { ContentSummary, HealthStatus, MediaReference, PageResult } from "./types";

export interface DashboardData {
  contentCount: number | null;
  mediaCount: number | null;
  workspacesCount: number | null;
  usersCount: number | null;
  recentActivity: ContentSummary[] | null;
  backendOnline: boolean;
}

export const DASHBOARD_RECENT_LIMIT = 5;

export async function fetchDashboardData(
  api: ApiClient,
  workspaceId: string,
): Promise<DashboardData> {
  const [health, content, media, workspaces] = await Promise.allSettled([
    api.health(),
    api.listContent(workspaceId, {
      page: 1,
      pageSize: DASHBOARD_RECENT_LIMIT,
      sort: "-updatedAt",
    }),
    api.listMedia(workspaceId),
    api.listWorkspaces(),
  ]);

  return {
    backendOnline: settledOk(health, (h) => h.status === "ok") === true,
    contentCount: settledOk(content, (r) => r.total),
    mediaCount: settledOk(media, (list) => list.length),
    workspacesCount: settledOk(workspaces, (list) => list.length),
    usersCount: null,
    recentActivity: settledOk(content, (r) => r.items),
  };
}

export function hasActivity(items: ContentSummary[] | null): items is ContentSummary[] {
  return Array.isArray(items) && items.length > 0;
}

function settledOk<T, R>(result: PromiseSettledResult<T>, pick: (value: T) => R): R | null {
  if (result.status !== "fulfilled") return null;
  const value = pick(result.value);
  return value === undefined || value === null ? null : value;
}

export type {
  ContentSummary,
  HealthStatus,
  MediaReference,
  PageResult,
};
