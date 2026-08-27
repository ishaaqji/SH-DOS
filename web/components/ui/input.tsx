import type { InputHTMLAttributes, ReactNode } from "react";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className = "", ...rest }: InputProps) {
  return (
    <input
      className={["input", className].filter(Boolean).join(" ")}
      aria-invalid={invalid}
      style={invalid ? { borderColor: "var(--danger)" } : undefined}
      {...rest}
    />
  );
}
