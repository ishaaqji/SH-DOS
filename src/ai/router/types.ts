import type { Storable } from "../../kernel/store";
import type { AiCapability, AiMessage, AiTaskType } from "../types";

export type AiLatencyPreference = "low" | "balanced" | "any";

export type AiFallbackPolicy = "never" | "alternate_provider" | "alternate_model" | "alternate_any";

export interface AiRoutingInput {
  taskType?: AiTaskType;
  capability?: AiCapability;
  preferredProvider?: string;
  preferredModel?: string;
  maxCost?: number;
  latencyPreference?: AiLatencyPreference;
  fallbackPolicy?: AiFallbackPolicy;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface RouteCandidate {
  provider: string;
  model: string;
  estimatedCost: number;
  avgLatencyMs?: number;
  capabilities: AiCapability[];
  primary: boolean;
}

export interface RoutingAttempt {
  provider: string;
  model: string;
  ok: boolean;
  errorCode?: string;
  latencyMs?: number;
}

export interface RoutingDecision extends Storable {
  workspaceId: string;
  actorId: string;
  input: {
    taskType?: AiTaskType;
    capability?: AiCapability;
    preferredProvider?: string;
    preferredModel?: string;
    maxCost?: number;
    latencyPreference?: AiLatencyPreference;
    fallbackPolicy?: AiFallbackPolicy;
  };
  candidates: RouteCandidate[];
  attempts: RoutingAttempt[];
  selected?: { provider: string; model: string };
  status: "ok" | "failed";
  errorCode?: string;
}
