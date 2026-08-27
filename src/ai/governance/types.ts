import type { Storable } from "../../kernel/store";
import type { AiMessage, AiTaskType } from "../types";

export type AiPiiField = "email" | "phone" | "ssn" | "credit_card" | "ip_address" | "address";

export type ModerationCategory =
  | "hate"
  | "harassment"
  | "violence"
  | "sexual"
  | "self_harm"
  | "spam"
  | "harmful";

export type GovernanceSeverity = "block" | "flag";

export interface GovernanceFinding {
  kind: "pii" | "moderation" | "input_safety" | "output_safety";
  category?: string;
  severity: GovernanceSeverity;
  detail: string;
}

export interface GovernanceDecision {
  verdict: "allow" | "flag" | "block";
  findings: GovernanceFinding[];
  redactedMessages?: AiMessage[];
  requiresReview: boolean;
  reviewId?: string;
}

export interface PiiPolicy {
  enabled: boolean;
  fields: AiPiiField[];
  mode: "redact" | "block";
}

export interface ModerationPolicy {
  enabled: boolean;
  blockCategories: ModerationCategory[];
  flagCategories: ModerationCategory[];
}

export interface InputSafetyPolicy {
  enabled: boolean;
  blockedTerms: string[];
  maxPromptLength: number;
  detectPromptInjection: boolean;
}

export interface OutputSafetyPolicy {
  enabled: boolean;
  blockedTerms: string[];
  maxOutputLength: number;
}

export interface HumanReviewPolicy {
  enabled: boolean;
}

export interface GovernancePolicy {
  enabled: boolean;
  modelAllowlist?: string[];
  pii: PiiPolicy;
  moderation: ModerationPolicy;
  inputSafety: InputSafetyPolicy;
  outputSafety: OutputSafetyPolicy;
  humanReview: HumanReviewPolicy;
}

export type GovernancePolicyPatch = {
  enabled?: boolean;
  modelAllowlist?: string[] | null;
  pii?: Partial<PiiPolicy>;
  moderation?: Partial<ModerationPolicy>;
  inputSafety?: Partial<InputSafetyPolicy>;
  outputSafety?: Partial<OutputSafetyPolicy>;
  humanReview?: Partial<HumanReviewPolicy>;
};

export interface WorkspaceGovernanceConfig extends Storable {
  workspaceId: string;
  policy: GovernancePolicy;
}

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewRecord extends Storable {
  workspaceId: string;
  actorId: string;
  summary: { messages?: AiMessage[]; output?: string };
  findings: GovernanceFinding[];
  status: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
}

export type GovernanceAuditEvent =
  | "blocked"
  | "flagged"
  | "redacted"
  | "review_required"
  | "review_approved"
  | "review_rejected"
  | "allowed";

export interface GovernanceAuditRecord extends Storable {
  workspaceId: string;
  actorId: string;
  event: GovernanceAuditEvent;
  reasons: string[];
  model?: string;
  reviewId?: string;
}

export type GovernedRoutingInput = {
  taskType?: AiTaskType;
  preferredProvider?: string;
  preferredModel?: string;
  maxCost?: number;
  fallbackPolicy?: "never" | "alternate_provider" | "alternate_model" | "alternate_any";
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
};
