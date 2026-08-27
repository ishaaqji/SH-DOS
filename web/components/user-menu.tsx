"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User, Workspace } from "@/lib/types";
import { roleLabel, roleFor } from "@/lib/nav";
import { Avatar } from "./ui/avatar";
import { Icon } from "./ui/icons";

export function UserMenu({
  user,
  workspace,
}: {
  user: User;
  workspace: Workspace;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const role = roleLabel(roleFor(user, workspace.id));

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
      >
        <Avatar name={user.name} />
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="user-menu-popover" role="menu">
          <div className="user-menu-header">
            <div className="user-menu-name">{user.name}</div>
            <div className="user-menu-email">{user.email}</div>
            <div className="user-menu-role">{role}</div>
          </div>
          <div className="user-menu-section">
            <Link href="/dashboard/settings" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <Icon name="settings" size={16} />
              <span>Settings</span>
            </Link>
            <Link href="/dashboard/analytics" className="user-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <Icon name="analytics" size={16} />
              <span>Analytics</span>
            </Link>
          </div>
          <div className="user-menu-footer">
            <button type="button" className="user-menu-item user-menu-logout" role="menuitem" onClick={logout} disabled={busy}>
              <Icon name="logout" size={16} />
              <span>{busy ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
