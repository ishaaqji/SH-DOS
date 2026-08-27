import type { ReactNode } from "react";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return <span className={["badge", `badge-${variant}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
