import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={["card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        {title && <h3 className="card-title">{title}</h3>}
        {description && <p className="card-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {}

export function CardBody({ className = "", children, ...rest }: CardBodyProps) {
  return (
    <div className={["card-body", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
