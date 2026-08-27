import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { parseContentQuery, contentQueryParams, paginationInfo } from "@/lib/content";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { ContentFilters } from "@/components/content/content-filters";
import { ContentTable } from "@/components/content/content-table";
import { ContentPagination } from "@/components/content/content-pagination";
import { TaxonomyManager } from "@/components/content/taxonomy-manager";
import { canManageContent, canDeleteContent } from "@/lib/permissions";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage({
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
  const canEdit = canManageContent(roles);
  const canDelete = canDeleteContent(roles);

  const [contentResult, categories, tags, languages] = await Promise.all([
    api.listContent(workspace.id, {
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      search: query.search,
      type: query.type,
      status: query.status,
      category: query.category,
      tag: query.tag,
      author: query.author,
      locale: query.locale,
    }),
    api.listCategories(workspace.id).catch(() => []),
    api.listTags(workspace.id).catch(() => []),
    api.listLanguages(workspace.id).catch(() => []),
  ]);

  const pagination = paginationInfo(contentResult.total, query.page, query.pageSize);
  const queryString = contentQueryParams(query);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Content</h1>
          <p className="text-sm text-muted">
            Create, edit and organize multilingual content for <strong>{workspace.name}</strong>.
          </p>
        </div>
        <Link href="/dashboard/content/new" className="btn btn-primary btn-sm">
          <Icon name="plus" size={15} />
          New content
        </Link>
      </div>

      <Card>
        <CardHeader
          title="All content"
          description={`${contentResult.total} ${contentResult.total === 1 ? "item" : "items"} in this workspace`}
        />
        <CardBody>
          <ContentFilters categories={categories} tags={tags} languages={languages} />
          <div className="content-section">
            <ContentTable
              items={contentResult.items}
              workspaceId={workspace.id}
              canCreate={canEdit}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
          <div className="content-section">
            <ContentPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              query={queryString}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Categories & tags" description="Manage the taxonomy used to organize content." />
        <CardBody>
          <TaxonomyManager workspaceId={workspace.id} categories={categories} tags={tags} />
        </CardBody>
      </Card>
    </>
  );
}
