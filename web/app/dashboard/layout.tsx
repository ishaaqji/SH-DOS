import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession, getCurrentWorkspace } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeWorkspace = await getCurrentWorkspace(session.user, session.workspaces);

  return (
    <AppShell
      user={session.user}
      workspaces={session.workspaces}
      activeWorkspace={activeWorkspace}
      title={activeWorkspace.name}
    >
      {children}
    </AppShell>
  );
}
