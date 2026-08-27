import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canUseAi } from "@/lib/permissions";
import { AiSubnav } from "@/components/ai/ai-subnav";
import { AssistantPanel } from "@/components/ai/assistant-panel";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AiAssistantPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const roles = roleFor(session.user, workspace.id);
  const canUse = canUseAi(roles);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI assistant</h1>
          <p className="text-sm text-muted">
            Governed AI generation for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <AiSubnav />

      <div style={{ marginTop: "1.5rem" }}>
        <AssistantPanel workspaceId={workspace.id} canUse={canUse} />
      </div>
    </>
  );
}
