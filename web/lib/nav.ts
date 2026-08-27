export interface NavItem {
  label: string;
  href: string;
  icon: "dashboard" | "content" | "media" | "publishing" | "search" | "analytics" | "settings" | "ai";
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Content", href: "/dashboard/content", icon: "content" },
  { label: "Media", href: "/dashboard/media", icon: "media" },
  { label: "Publishing", href: "/dashboard/publishing", icon: "publishing" },
  { label: "Search", href: "/dashboard/search", icon: "search" },
  { label: "AI", href: "/dashboard/ai", icon: "ai" },
  { label: "Analytics", href: "/dashboard/analytics", icon: "analytics" },
  { label: "Settings", href: "/dashboard/settings", icon: "settings" },
];

export function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function firstLetter(name: string): string {
  const char = name?.trim().charAt(0) ?? "";
  return char ? char.toUpperCase() : "?";
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function workspaceLabel(workspace: { name: string; slug: string }): string {
  return workspace.name || workspace.slug;
}

export function roleLabel(roles: string[]): string {
  const order = ["owner", "admin", "editor", "reviewer", "author", "viewer"];
  const present = roles.filter((role) => order.includes(role));
  const primary = present.sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )[0] ?? roles[0] ?? "Member";
  return primary.charAt(0).toUpperCase() + primary.slice(1);
}

export function roleFor(
  user: { memberships: Array<{ workspaceId: string; roles: string[] }> },
  workspaceId: string,
): string[] {
  const exact = user.memberships.find((m) => m.workspaceId === workspaceId);
  if (exact) return exact.roles;
  const wildcard = user.memberships.find((m) => m.workspaceId === "*");
  return wildcard ? wildcard.roles : [];
}
