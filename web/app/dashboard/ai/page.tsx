import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { parseAiDashboardQuery, fetchAiDashboard } from "@/lib/ai";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { OverviewCards } from "@/components/ai/overview-cards";
import { AuditPanel } from "@/components/ai/audit-panel";
import { AiSubnav } from "@/components/ai/ai-subnav";

export const metadata: Metadata = { title: "AI Usage & Governance" };

export default async function AiDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const params = await searchParams;
  const query = parseAiDashboardQuery(new URLSearchParams(params as Record<string, string>));
  const api = await getServerApi();
  if (!api) redirect("/login");

  const data = await fetchAiDashboard(api, workspace.id, query);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI usage &amp; governance</h1>
          <p className="text-sm text-muted">
            Requests, tokens, cost and policy actions for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <AiSubnav />

      {data.overview ? (
        <OverviewCards data={data.overview} />
      ) : (
        <Card>
          <CardBody>
            <div className="empty-state">
              <div className="empty-title">Overview unavailable</div>
              <p className="empty-desc">The AI usage overview could not be loaded for this workspace.</p>
            </div>
          </CardBody>
        </Card>
      )}

      <Card style={{ marginTop: "1.5rem" }}>
        <CardHeader
          title="AI audit trail"
          description="Recent routing, governance and usage events, filtered by event type or date."
        />
        <CardBody>
          <AuditPanel audit={data.audit} />
        </CardBody>
      </Card>
    </>
  );
}
