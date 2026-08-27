import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ModulePlaceholder({
  title,
  description,
  milestone,
}: {
  title: string;
  description: string;
  milestone: string;
}) {
  return (
    <>
      <div className="welcome">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <Card>
        <CardHeader
          title="Not implemented yet"
          description={`This module ships in a later milestone.`}
          action={<Badge variant="primary">{milestone}</Badge>}
        />
        <CardBody>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            The SH-DOS Control Center foundation is now in place. The {title.toLowerCase()} module will be added
            as part of {milestone}. Navigation and theming are ready for it.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
