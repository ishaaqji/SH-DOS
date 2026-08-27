import type { ReactNode } from "react";
import { Icon } from "../ui/icons";
import { Card } from "../ui/card";

export interface KpiCardProps {
  label: string;
  value: number | null;
  hint: string;
  icon: "users" | "building" | "content" | "media";
  placeholder?: boolean;
  children?: ReactNode;
}

export function KpiCard({ label, value, hint, icon, placeholder = false, children }: KpiCardProps) {
  return (
    <Card className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">
          <Icon name={icon} size={18} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">
        {value === null ? <span className="stat-empty">—</span> : value.toLocaleString()}
      </div>
      <div className="stat-hint">{hint}</div>
      {children}
      {placeholder && (
        <div className="stat-note">
          <Icon name="clock" size={13} />
          <span>Live data coming soon</span>
        </div>
      )}
    </Card>
  );
}
