"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./ui/icons";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
    <button type="button" className="icon-btn" onClick={logout} disabled={busy} title="Sign out" aria-label="Sign out">
      <Icon name="logout" size={18} />
    </button>
  );
}
