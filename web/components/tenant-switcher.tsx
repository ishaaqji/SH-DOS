"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "@/lib/types";
import { workspaceLabel } from "@/lib/nav";
import { Icon } from "./ui/icons";

export function TenantSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  if (!active) return null;

  const switchTo = async (workspace: Workspace) => {
    if (workspace.id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tenant-switcher">
      <button
        type="button"
        className="tenant-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
      >
        <span className="tenant-dot tenant-dot-active" />
        <span>{workspaceLabel(active)}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="tenant-menu" role="menu">
          <div className="tenant-menu-header">Workspaces</div>
          {workspaces.map((workspace) => {
            const isActive = workspace.id === activeId;
            return (
              <button
                key={workspace.id}
                type="button"
                role="menuitem"
                className={`tenant-option${isActive ? " tenant-option-active" : ""}`}
                onClick={() => switchTo(workspace)}
                disabled={busy}
              >
                <span className={`tenant-dot${isActive ? " tenant-dot-active" : ""}`} />
                <span>{workspaceLabel(workspace)}</span>
                {isActive && (
                  <span style={{ marginLeft: "auto" }}>
                    <Icon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
