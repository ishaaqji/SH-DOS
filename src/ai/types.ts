import type { Storable } from "../kernel/store";

export type AiRole = "system" | "user" | "assistant";

export type AiCapability = "chat" | "vision" | "reasoning" | "long_context" | "code" | "fast";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiChatRequest {
  model: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatResponse {
  id: string;
  provider: string;
  model: string;
  content: string;
  usage: AiUsage;
  cost: number;
  createdAt: string;
}

export interface RegisteredModel {
  id: string;
  provider: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  pricing: {
    inputPerMToken: number;
    outputPerMToken: number;
  };
  capabilities?: AiCapability[];
  avgLatencyMs?: number;
}

export interface ProviderSettings {
  providerId: string;
  label: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  defaultModel?: string;
  timeoutMs: number;
  retries: number;
}

export interface QuotaLimits {
  requestsPerDay?: number;
  tokensPerDay?: number;
  costPerDay?: number;
}

export type AiTaskType = "chat" | "summarize" | "classify" | "extract" | "translate" | "code";

export interface WorkspaceAiConfig extends Storable {
  workspaceId: string;
  defaultProvider: string;
  defaultModel?: string;
  taskModels?: Partial<Record<AiTaskType, string>>;
  providers: Record<string, ProviderSettings>;
  quota: QuotaLimits;
}

export interface UsageRecord extends Storable {
  workspaceId: string;
  providerId: string;
  model: string;
  actorId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  ok: boolean;
  errorCode?: string;
  latencyMs?: number;
}
