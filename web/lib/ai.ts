import type { ApiClient } from "./api";
import type { PageResult } from "./types";

export interface AiDashboardQuery {
  from?: string;
  to?: string;
  event?: string;
  provider?: string;
  model?: string;
  page?: number;
  pageSize?: number;
}

export interface AiUsageSummary {
  requests: number;
  okRequests: number;
  failedRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgLatencyMs: number | null;
}

export interface AiByDay {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface AiByProvider {
  providerId: string;
  requests: number;
  tokens: number;
  cost: number;
  avgLatencyMs: number | null;
}

export interface AiByModel {
  providerId: string;
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface AiUsage {
  summary: AiUsageSummary;
  byDay: AiByDay[];
  byProvider: AiByProvider[];
  byModel: AiByModel[];
}

export interface AiQuotaLimits {
  requestsPerDay?: number;
  tokensPerDay?: number;
  costPerDay?: number;
}

export interface AiQuota {
  limits: AiQuotaLimits;
  used: { requests: number; tokens: number; cost: number };
  remaining: { requests?: number; tokens?: number; cost?: number };
}

export type AiGovernanceEvent =
  | "blocked"
  | "flagged"
  | "redacted"
  | "review_required"
  | "review_approved"
  | "review_rejected"
  | "allowed";

export interface AiGovernance {
  counts: Record<AiGovernanceEvent, number>;
  piiRedactions: number;
  moderation: {
    blocked: number;
    flagged: number;
    byCategory: Record<string, number>;
  };
}

export interface AiReviews {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface AiDashboardOverview {
  usage: AiUsage;
  quota: AiQuota;
  governance: AiGovernance;
  reviews: AiReviews;
}

export type AiAuditEventSource = "governance" | "usage";

export interface AiAuditEvent {
  id: string;
  createdAt: string;
  source: AiAuditEventSource;
  event: string;
  actorId: string;
  providerId?: string;
  model?: string;
  detail?: string;
}

export type AiAuditPage = PageResult<AiAuditEvent>;

export const AI_GOVERNANCE_EVENTS: AiGovernanceEvent[] = [
  "blocked",
  "flagged",
  "redacted",
  "review_required",
  "review_approved",
  "review_rejected",
  "allowed",
];

export const AI_USAGE_EVENTS = ["request_ok", "request_failed"];

export const AI_AUDIT_EVENTS = [...AI_GOVERNANCE_EVENTS, ...AI_USAGE_EVENTS];

export const DEFAULT_PAGE_SIZE = 20;

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseAiDashboardQuery(searchParams: URLSearchParams): AiDashboardQuery {
  return {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    event: searchParams.get("event") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    page: toInt(searchParams.get("page"), 1),
    pageSize: Math.min(100, toInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE)),
  };
}

export function aiDashboardQueryParams(query: AiDashboardQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.event) params.set("event", query.event);
  if (query.provider) params.set("provider", query.provider);
  if (query.model) params.set("model", query.model);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(query.pageSize));
  return params;
}

export interface AiDashboardData {
  overview: AiDashboardOverview | null;
  audit: AiAuditPage | null;
}

export async function fetchAiDashboard(
  api: ApiClient,
  workspaceId: string,
  query: AiDashboardQuery,
): Promise<AiDashboardData> {
  const [overview, audit] = await Promise.allSettled([
    api.aiDashboard(workspaceId, query),
    api.aiAudit(workspaceId, query),
  ]);
  return {
    overview: overview.status === "fulfilled" ? overview.value : null,
    audit: audit.status === "fulfilled" ? audit.value : null,
  };
}

export function eventLabel(event: string): string {
  return event.replaceAll("_", " ");
}

export function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  return value.toLocaleString();
}

export type AiTaskType =
  | "chat"
  | "summarize"
  | "classify"
  | "extract"
  | "translate"
  | "code";

export const AI_TASK_TYPES: AiTaskType[] = [
  "chat",
  "summarize",
  "classify",
  "extract",
  "translate",
  "code",
];

export type AiPiiField = "email" | "phone" | "ssn" | "credit_card" | "ip_address" | "address";

export const AI_PII_FIELDS: AiPiiField[] = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ip_address",
  "address",
];

export type ModerationCategory =
  | "hate"
  | "harassment"
  | "violence"
  | "sexual"
  | "self_harm"
  | "spam"
  | "harmful";

export const MODERATION_CATEGORIES: ModerationCategory[] = [
  "hate",
  "harassment",
  "violence",
  "sexual",
  "self_harm",
  "spam",
  "harmful",
];

export interface AiPublicProviderSettings {
  providerId: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  defaultModel?: string;
  timeoutMs: number;
  retries: number;
}

export interface AiPublicConfig {
  workspaceId: string;
  defaultProvider: string;
  defaultModel?: string;
  taskModels?: Partial<Record<AiTaskType, string>>;
  providers: Record<string, AiPublicProviderSettings>;
  quota: AiQuotaLimits;
}

export interface AiConfigUpdate {
  providerId?: string;
  settings?: Partial<Omit<AiPublicProviderSettings, "providerId" | "label">>;
  defaultProvider?: string;
  defaultModel?: string;
  taskModels?: Partial<Record<AiTaskType, string>>;
  quota?: AiQuotaLimits;
}

export interface AiPiiPolicy {
  enabled: boolean;
  fields: AiPiiField[];
  mode: "redact" | "block";
}

export interface AiModerationPolicy {
  enabled: boolean;
  blockCategories: ModerationCategory[];
  flagCategories: ModerationCategory[];
}

export interface AiInputSafetyPolicy {
  enabled: boolean;
  blockedTerms: string[];
  maxPromptLength: number;
  detectPromptInjection: boolean;
}

export interface AiOutputSafetyPolicy {
  enabled: boolean;
  blockedTerms: string[];
  maxOutputLength: number;
}

export interface AiHumanReviewPolicy {
  enabled: boolean;
}

export interface AiGovernancePolicy {
  enabled: boolean;
  modelAllowlist?: string[];
  pii: AiPiiPolicy;
  moderation: AiModerationPolicy;
  inputSafety: AiInputSafetyPolicy;
  outputSafety: AiOutputSafetyPolicy;
  humanReview: AiHumanReviewPolicy;
}

export interface AiGovernancePolicyPatch {
  enabled?: boolean;
  modelAllowlist?: string[] | null;
  pii?: Partial<AiPiiPolicy>;
  moderation?: Partial<AiModerationPolicy>;
  inputSafety?: Partial<AiInputSafetyPolicy>;
  outputSafety?: Partial<AiOutputSafetyPolicy>;
  humanReview?: Partial<AiHumanReviewPolicy>;
}

export type AiReviewStatus = "pending" | "approved" | "rejected";

export type AiFindingKind = "pii" | "moderation" | "input_safety" | "output_safety";

export type AiFindingSeverity = "block" | "flag";

export interface AiGovernanceFinding {
  kind: AiFindingKind;
  category?: string;
  severity: AiFindingSeverity;
  detail: string;
}

export interface AiReviewMessage {
  role: string;
  content: string;
}

export interface AiReviewSummary {
  messages?: AiReviewMessage[];
  output?: string;
}

export interface AiReviewRecord {
  id: string;
  workspaceId: string;
  actorId: string;
  createdAt: string;
  updatedAt: string;
  summary: AiReviewSummary;
  findings: AiGovernanceFinding[];
  status: AiReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
}

export type AiReviewAction = "approve" | "reject";

export function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((it) => it !== item) : [...list, item];
}

export function textToTerms(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function termsToText(terms: string[] | undefined): string {
  return (terms ?? []).join("\n");
}

export function textToAllowlist(text: string): string[] | null {
  const terms = textToTerms(text);
  return terms.length > 0 ? terms : null;
}

export function allowlistToText(models: string[] | undefined): string {
  return termsToText(models);
}

export function parseQuotaValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function providerSettingsPatch(
  provider: AiPublicProviderSettings,
  changes: Partial<Pick<AiPublicProviderSettings, "enabled" | "baseUrl" | "defaultModel">>,
): AiConfigUpdate {
  return { providerId: provider.providerId, settings: changes };
}

export function taskModelsPatch(
  taskModels: Partial<Record<AiTaskType, string>>,
): AiConfigUpdate {
  const models: Partial<Record<AiTaskType, string>> = {};
  for (const task of AI_TASK_TYPES) {
    const value = taskModels[task]?.trim() ?? "";
    if (value.length > 0) models[task] = value;
  }
  return { taskModels: models };
}

export interface AiMessage {
  role: string;
  content: string;
}

export interface AiChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatResponse {
  id: string;
  provider: string;
  model: string;
  content: string;
  usage: AiChatUsage;
  cost: number;
  createdAt: string;
}

export type AiAssistantTask = "chat" | "summarize" | "translate" | "extract" | "code";

export interface AiAssistantInput {
  taskType?: AiAssistantTask;
  messages: AiMessage[];
}

export const AI_ASSISTANT_TASKS: Array<{ value: AiAssistantTask; label: string; hint: string }> = [
  { value: "chat", label: "Chat", hint: "Free-form assistant response" },
  { value: "summarize", label: "Summarize", hint: "Condense the text you provide" },
  { value: "translate", label: "Translate", hint: "Translate text into clear English" },
  { value: "extract", label: "Extract", hint: "Pull out the key facts" },
  { value: "code", label: "Code", hint: "Generate a code snippet" },
];

export function assistantSystemPrompt(task: AiAssistantTask): string | undefined {
  switch (task) {
    case "summarize":
      return "Summarize the following text concisely. Reply with only the summary.";
    case "translate":
      return "Translate the following text into clear English. Reply with only the translation.";
    case "extract":
      return "Extract the key facts from the following text. Reply with a concise bullet list.";
    case "code":
      return "Generate clean, well-structured code for the following request. Reply with only the code block.";
    default:
      return undefined;
  }
}

export function buildAssistantMessages(task: AiAssistantTask, prompt: string): AiMessage[] {
  const system = assistantSystemPrompt(task);
  const messages: AiMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  const trimmed = prompt.trim();
  if (trimmed) messages.push({ role: "user", content: trimmed });
  return messages;
}

export type AssistantErrorTone = "danger" | "warning" | "neutral";

export interface AssistantErrorState {
  title: string;
  description: string;
  tone: AssistantErrorTone;
}

export function assistantErrorState(code: string | null): AssistantErrorState {
  switch (code) {
    case "CANCELLED":
      return {
        title: "Request cancelled",
        description: "The request was cancelled before it completed.",
        tone: "neutral",
      };
    case "AI_BLOCKED":
      return {
        title: "Blocked by governance policy",
        description: "This request was blocked by the workspace governance policy before it could run. Adjust the prompt or ask an admin to review the policy.",
        tone: "danger",
      };
    case "AI_REVIEW_REQUIRED":
      return {
        title: "Flagged for human review",
        description: "This request was flagged for human review and will run once an admin or editor approves it.",
        tone: "warning",
      };
    case "AI_QUOTA_EXCEEDED":
      return {
        title: "Daily quota reached",
        description: "The workspace AI quota for today has been used up. Try again later.",
        tone: "warning",
      };
    case "AI_NOT_CONFIGURED":
      return {
        title: "AI not configured",
        description: "No AI provider is configured for this workspace yet. Ask an admin to set one up in AI settings.",
        tone: "neutral",
      };
    default:
      return {
        title: "Request failed",
        description: "",
        tone: "danger",
      };
  }
}

export function formatUsage(usage: AiChatUsage): string {
  return `${formatTokens(usage.totalTokens)} tokens (${formatTokens(usage.promptTokens)} in / ${formatTokens(usage.completionTokens)} out)`;
}
