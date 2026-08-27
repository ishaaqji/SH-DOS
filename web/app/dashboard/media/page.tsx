import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { parseMediaQuery } from "@/lib/media";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MediaLibrary } from "@/components/media/media-library";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const params = await searchParams;
  parseMediaQuery(new URLSearchParams(params as Record<string, string>));

  const roles = roleFor(session.user, workspace.id);
  const canUpload = roles.some((role) => ["owner", "admin", "editor"].includes(role));
  const canEdit = roles.some((role) => ["owner", "admin", "editor", "author"].includes(role));
  const canDelete = roles.some((role) => ["owner", "admin", "editor"].includes(role));

  const media = await api.listMedia(workspace.id).catch(() => []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Media</h1>
          <p className="text-sm text-muted">
            Upload and organise images, videos, audio and files for <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Media library"
          description={`${media.length} ${media.length === 1 ? "item" : "items"} in this workspace`}
        />
        <CardBody>
          <MediaLibrary
            items={media}
            workspaceId={workspace.id}
            canUpload={canUpload}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </CardBody>
      </Card>
    </>
  );
}
