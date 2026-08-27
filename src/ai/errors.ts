import { DomainError } from "../kernel/errors";

export type AiErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_MODEL_NOT_FOUND"
  | "AI_MODEL_BLOCKED"
  | "AI_INVALID_REQUEST"
  | "AI_BLOCKED"
  | "AI_REVIEW_REQUIRED"
  | "AI_SAFETY_ERROR"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_QUOTA_EXCEEDED"
  | "AI_AUTH_FAILED"
  | "AI_PROVIDER_ERROR";

export interface AiErrorOptions {
  status?: number;
  retryable?: boolean;
  provider?: string;
  model?: string;
}

export class AiError extends DomainError {
  readonly retryable: boolean;
  readonly provider?: string;
  readonly model?: string;

  constructor(code: AiErrorCode, message: string, options: AiErrorOptions = {}) {
    super(code, message, options.status ?? 502);
    this.name = "AiError";
    this.retryable = options.retryable ?? false;
    this.provider = options.provider;
    this.model = options.model;
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
