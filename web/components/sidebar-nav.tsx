"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { Badge } from "./ui/badge";
import { Icon } from "./ui/icons";

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      <div className="sidebar-section">Workspace</div>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href, pathname ?? "");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${active ? " nav-item-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="nav-item-label">{item.label}</span>
            {item.badge && <Badge variant="primary">{item.badge}</Badge>}
          </Link>
        );
      })}
    </nav>
  );
}
