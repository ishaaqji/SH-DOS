import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageContent } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ContentForm } from "@/components/content/content-form";

export const metadata: Metadata = { title: "New content" };

export default async function NewContentPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const api = await getServerApi();
  if (!api) redirect("/login");

  const roles = roleFor(session.user, workspace.id);
  if (!canManageContent(roles)) redirect("/dashboard/content");

  const [categories, tags, authors, languages] = await Promise.all([
    api.listCategories(workspace.id).catch(() => []),
    api.listTags(workspace.id).catch(() => []),
    api.listAuthors(workspace.id).catch(() => []),
    api.listLanguages(workspace.id).catch(() => []),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>New content</h1>
          <p className="text-sm text-muted">Create a new item in {workspace.name}.</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Content details" description="Fill in the basics — the rich editor arrives in a later milestone." />
        <CardBody>
          <ContentForm
            workspaceId={workspace.id}
            categories={categories}
            tags={tags}
            authors={authors}
            languages={languages}
          />
        </CardBody>
      </Card>
    </>
  );
}
