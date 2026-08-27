import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageAi } from "@/lib/permissions";
import { Card, CardBody } from "@/components/ui/card";
import { AiSubnav } from "@/components/ai/ai-subnav";
import { SettingsForm } from "@/components/ai/settings-form";

export const metadata: Metadata = { title: "AI Settings" };

export default async function AiSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  const canManage = canManageAi(roles);
  const config = await api.getAiConfig(workspace.id).catch(() => null);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI settings</h1>
          <p className="text-sm text-muted">
            Providers, models and daily quota for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <AiSubnav />

      <div style={{ marginTop: "1.5rem" }}>
        {config ? (
          <SettingsForm workspaceId={workspace.id} config={config} canManage={canManage} />
        ) : (
          <Card>
            <CardBody>
              <div className="empty-state">
                <div className="empty-title">Settings unavailable</div>
                <p className="empty-desc">The AI configuration could not be loaded for this workspace.</p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
