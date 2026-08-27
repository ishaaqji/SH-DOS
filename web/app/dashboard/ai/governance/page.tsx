import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageAi } from "@/lib/permissions";
import { Card, CardBody } from "@/components/ui/card";
import { AiSubnav } from "@/components/ai/ai-subnav";
import { GovernanceForm } from "@/components/ai/governance-form";

export const metadata: Metadata = { title: "AI Governance" };

export default async function AiGovernancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  const canManage = canManageAi(roles);
  const policy = await api.getGovernancePolicy(workspace.id).catch(() => null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI governance</h1>
          <p className="text-sm text-muted">
            Inspection, moderation and review policy for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <AiSubnav />

      <div style={{ marginTop: "1.5rem" }}>
        {policy ? (
          <GovernanceForm workspaceId={workspace.id} policy={policy} canManage={canManage} />
        ) : (
          <Card>
            <CardBody>
              <div className="empty-state">
                <div className="empty-title">Policy unavailable</div>
                <p className="empty-desc">The governance policy could not be loaded for this workspace.</p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
