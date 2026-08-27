import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { parseContentQuery, contentQueryParams, paginationInfo } from "@/lib/content";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PublishingQueue } from "@/components/publishing/publishing-queue";
import {
  canSubmitForReview,
  canReview,
  canPublish,
  canSchedule,
} from "@/lib/publishing";

export const metadata: Metadata = { title: "Publishing" };

export default async function PublishingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const params = await searchParams;
  const query = parseContentQuery(new URLSearchParams(params as Record<string, string>));
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  const permissions = {
    canSubmitForReview: canSubmitForReview(roles),
    canReview: canReview(roles),
    canPublish: canPublish(roles),
    canSchedule: canSchedule(roles),
  };

  const result = await api.listContent(workspace.id, {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    search: query.search,
    type: query.type,
    status: query.status,
    locale: query.locale,
  });

  const pagination = paginationInfo(result.total, query.page, query.pageSize);
  const queryString = contentQueryParams(query);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Publishing</h1>
          <p className="text-sm text-muted">
            Review, approve and publish content for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Publishing queue"
          description={`${result.total} ${result.total === 1 ? "item" : "items"} in the current view`}
        />
        <CardBody>
          <PublishingQueue
            items={result.items}
            total={result.total}
            pagination={pagination}
            query={queryString}
            workspaceId={workspace.id}
            permissions={permissions}
          />
        </CardBody>
      </Card>
    </>
  );
}
