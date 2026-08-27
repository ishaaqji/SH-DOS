"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/ai", label: "Overview" },
  { href: "/dashboard/ai/assistant", label: "Assistant" },
  { href: "/dashboard/ai/settings", label: "Settings" },
  { href: "/dashboard/ai/governance", label: "Governance" },
  { href: "/dashboard/ai/review", label: "Review" },
];

export function AiSubnav() {
  const pathname = usePathname();
  return (
    <div className="publishing-tabs" role="tablist" aria-label="AI dashboard sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={["publishing-tab", active ? "publishing-tab-active" : ""].filter(Boolean).join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
