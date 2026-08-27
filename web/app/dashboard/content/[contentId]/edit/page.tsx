import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageContent } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ContentForm } from "@/components/content/content-form";

export const metadata: Metadata = { title: "Edit content" };

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  if (!canManageContent(roles)) redirect("/dashboard/content");

  const { contentId } = await params;

  const [resolved, categories, tags, authors, languages] = await Promise.all([
    api.getContent(workspace.id, contentId).catch(() => null),
    api.listCategories(workspace.id).catch(() => []),
    api.listTags(workspace.id).catch(() => []),
    api.listAuthors(workspace.id).catch(() => []),
    api.listLanguages(workspace.id).catch(() => []),
  ]);

  if (!resolved) notFound();

  const content = resolved.content;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Edit content</h1>
          <p className="text-sm text-muted">
            Update {content.title} in {workspace.name}.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Content details" description="Edit the fields below. The rich editor arrives in a later milestone." />
        <CardBody>
          <ContentForm
            workspaceId={workspace.id}
            categories={categories}
            tags={tags}
            authors={authors}
            languages={languages}
            content={content}
            contentId={content.id}
          />
        </CardBody>
      </Card>
    </>
  );
}
