import { Card, CardHeader, CardBody } from "../ui/card";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";

export type ServiceStatus = "operational" | "degraded" | "offline" | "not_reporting";

export interface ServiceItem {
  name: string;
  status: ServiceStatus;
  detail?: string;
  icon: "server" | "content" | "media" | "search" | "shield" | "activity";
}

export function SystemStatus({ services }: { services: ServiceItem[] }) {
  return (
    <Card className="panel">
      <CardHeader title="System status" description="Health of the services backing this workspace." />
      <CardBody>
        <ul className="status-list">
          {services.map((service) => (
            <li key={service.name} className="status-item">
              <span className="status-icon">
                <Icon name={service.icon} size={16} />
              </span>
              <span className="status-main">
                <span className="status-name">{service.name}</span>
                {service.detail && <span className="status-detail">{service.detail}</span>}
              </span>
              <Badge variant={statusVariant(service.status)}>{statusLabel(service.status)}</Badge>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function statusVariant(status: ServiceStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "operational":
      return "success";
    case "degraded":
      return "warning";
    case "offline":
      return "danger";
    case "not_reporting":
      return "neutral";
  }
}

export function statusLabel(status: ServiceStatus): string {
  switch (status) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "offline":
      return "Offline";
    case "not_reporting":
      return "Not reporting";
  }
}
