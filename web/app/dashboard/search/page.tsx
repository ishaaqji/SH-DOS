import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleFor } from "@/lib/nav";
import { canManageContent } from "@/lib/permissions";
import { parseContentQuery, contentQueryParams, paginationInfo } from "@/lib/content";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SearchPanel } from "@/components/search/search-panel";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
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
  const canOpen = canManageContent(roles);

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
          <h1>Search</h1>
          <p className="text-sm text-muted">
            Find content across all locales in <strong>{workspace.name}</strong>.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Search content"
          description={
            query.search || pagination.total > 0
              ? `${pagination.total} ${pagination.total === 1 ? "result" : "results"} in the current view`
              : "Type a query or pick a filter to find content"
          }
        />
        <CardBody>
          <SearchPanel
            items={contentResult.items}
            total={contentResult.total}
            pagination={pagination}
            query={queryString}
            categories={categories}
            tags={tags}
            languages={languages}
            canOpen={canOpen}
          />
        </CardBody>
      </Card>
    </>
  );
}
