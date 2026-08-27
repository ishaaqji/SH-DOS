import Link from "next/link";
import { Card, CardHeader, CardBody } from "../ui/card";
import { Icon } from "../ui/icons";

export interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: "content" | "media" | "analytics" | "settings" | "users" | "building";
  primary?: boolean;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card className="panel">
      <CardHeader title="Quick actions" description="Jump straight to common tasks." />
      <CardBody>
        <div className="quick-action-list">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="quick-action">
              <span className={`quick-action-icon${action.primary ? " quick-action-icon-primary" : ""}`}>
                <Icon name={action.icon} size={17} />
              </span>
              <span className="quick-action-main">
                <span className="quick-action-label">{action.label}</span>
                <span className="quick-action-desc">{action.description}</span>
              </span>
              <Icon name="arrow-right" size={15} className="quick-action-arrow" />
            </Link>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
