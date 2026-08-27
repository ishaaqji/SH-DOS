import type { ReactNode } from "react";
import type { User, Workspace } from "@/lib/types";
import { roleLabel, roleFor } from "@/lib/nav";
import { Avatar } from "./ui/avatar";
import { Icon } from "./ui/icons";
import { ThemeToggle } from "./theme-toggle";
import { TenantSwitcher } from "./tenant-switcher";
import { LogoutButton } from "./logout-button";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function AppShell({
  user,
  workspaces,
  activeWorkspace,
  title,
  children,
}: {
  user: User;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  title: string;
  children: ReactNode;
}) {
  const roles = roleFor(user, activeWorkspace.id);
  const role = roleLabel(roles);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="auth-logo">S</span>
          <div>
            <div className="sidebar-brand-name">SH-DOS</div>
            <div className="sidebar-brand-sub">Control Center</div>
          </div>
        </div>
        <SidebarNav />
        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Avatar name={user.name} size="sm" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-sm" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </div>
              <div className="text-xs text-faint">{role}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="header">
          <TenantSwitcher workspaces={workspaces} activeId={activeWorkspace.id} />
          <div className="header-title">{title}</div>
          <div className="header-spacer" />
          <ThemeToggle />
          <UserMenu user={user} workspace={activeWorkspace} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
