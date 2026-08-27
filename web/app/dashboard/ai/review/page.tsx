import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageAi } from "@/lib/permissions";
import { Card, CardBody } from "@/components/ui/card";
import { AiSubnav } from "@/components/ai/ai-subnav";
import { ReviewQueue } from "@/components/ai/review-queue";
import type { AiReviewRecord } from "@/lib/ai";

export const metadata: Metadata = { title: "AI Review" };

export default async function AiReviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  const canManage = canManageAi(roles);

  let reviews: AiReviewRecord[] | null = null;
  if (canManage) {
    reviews = await api.listPendingAiReviews(workspace.id).catch(() => null);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI review queue</h1>
          <p className="text-sm text-muted">
            Approve or reject flagged AI requests for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <AiSubnav />

      <div style={{ marginTop: "1.5rem" }}>
        {!canManage || reviews !== null ? (
          <ReviewQueue workspaceId={workspace.id} reviews={reviews ?? []} canManage={canManage} />
        ) : (
          <Card>
            <CardBody>
              <div className="empty-state">
                <div className="empty-title">Review queue unavailable</div>
                <p className="empty-desc">The pending reviews could not be loaded for this workspace.</p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
