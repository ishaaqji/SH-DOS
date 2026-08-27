import { redirect } from "next/navigation";
import { getSession, getServerApi, getCurrentWorkspace } from "@/lib/session";
import { roleLabel, roleFor } from "@/lib/nav";
import { fetchDashboardData, hasActivity } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { QuickActions, type QuickAction } from "@/components/dashboard/quick-actions";
import { SystemStatus, type ServiceItem } from "@/components/dashboard/system-status";

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Create content",
    description: "Draft a new article or page",
    href: "/dashboard/content",
    icon: "content",
    primary: true,
  },
  {
    label: "Upload media",
    description: "Add images, video or attachments",
    href: "/dashboard/media",
    icon: "media",
  },
  {
    label: "Manage users",
    description: "Invite members and set roles",
    href: "/dashboard/settings",
    icon: "users",
  },
  {
    label: "View analytics",
    description: "Audience and engagement insights",
    href: "/dashboard/analytics",
    icon: "analytics",
  },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workspace = await getCurrentWorkspace(session.user, session.workspaces);
  const roles = roleFor(session.user, workspace.id);
  const role = roleLabel(roles);

  const api = await getServerApi();
  const data = api ? await fetchDashboardData(api, workspace.id) : null;

  const services: ServiceItem[] = [
    {
      name: "Core API",
      status: data?.backendOnline ? "operational" : "not_reporting",
      detail: data?.backendOnline ? "Healthy" : "No report received",
      icon: "server",
    },
    {
      name: "Content service",
      status: data?.contentCount !== null ? "operational" : "not_reporting",
      detail: data?.contentCount !== null ? "Indexing content" : "No report received",
      icon: "content",
    },
    {
      name: "Media service",
      status: data?.mediaCount !== null ? "operational" : "not_reporting",
      detail: data?.mediaCount !== null ? "Storage healthy" : "No report received",
      icon: "media",
    },
    {
      name: "Search index",
      status: "not_reporting",
      detail: "Index stats coming soon",
      icon: "search",
    },
  ];

  return (
    <>
      <div className="welcome">
        <h1>Welcome back, {session.user.name.split(" ")[0]}</h1>
        <p>
          This is the SH-DOS Control Center for <strong>{workspace.name}</strong>. Here is what is
          happening across your workspace.
        </p>
        <div className="welcome-meta">
          <Badge variant="neutral">{role}</Badge>
          <span className="mono">{workspace.slug}</span>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Users"
          value={data?.usersCount ?? null}
          hint="People in your organization"
          icon="users"
          placeholder
        />
        <KpiCard
          label="Organizations"
          value={data?.workspacesCount ?? null}
          hint="Workspaces you can access"
          icon="building"
        />
        <KpiCard
          label="Content"
          value={data?.contentCount ?? null}
          hint="Total items across all locales"
          icon="content"
        />
        <KpiCard
          label="Media"
          value={data?.mediaCount ?? null}
          hint="Images, videos and attachments"
          icon="media"
        />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          <RecentActivity items={data?.recentActivity ?? null} workspaceId={workspace.id} />
        </section>

        <aside className="dashboard-side">
          <QuickActions actions={QUICK_ACTIONS} />
          <SystemStatus services={services} />
        </aside>
      </div>

      <Card style={{ marginTop: "1.5rem" }}>
        <CardHeader title="Workspace details" description="Identity and locale configuration for this workspace." />
        <CardBody>
          <dl className="detail-list">
            <dt className="text-sm text-faint">Workspace ID</dt>
            <dd className="text-sm mono">{workspace.id}</dd>
            <dt className="text-sm text-faint">Base URL</dt>
            <dd className="text-sm mono">{workspace.baseUrl ?? "—"}</dd>
            <dt className="text-sm text-faint">Default language</dt>
            <dd className="text-sm mono">{workspace.defaultLocale}</dd>
            <dt className="text-sm text-faint">Roles</dt>
            <dd className="text-sm">
              <span className="badge-row">
                {roles.map((r) => (
                  <Badge key={r} variant="neutral">{r}</Badge>
                ))}
              </span>
            </dd>
          </dl>
        </CardBody>
      </Card>
    </>
  );
}
