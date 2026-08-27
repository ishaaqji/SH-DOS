import type { AiCapability, AiMessage, AiTaskType, RegisteredModel, ProviderSettings } from "../types";
import type { ModelRegistry } from "../registry";
import { AiError } from "../errors";
import type { AiFallbackPolicy, AiLatencyPreference, AiRoutingInput, RouteCandidate } from "./types";

export interface RoutingContext {
  registry: ModelRegistry;
  providers: Record<string, ProviderSettings>;
  defaultProvider: string;
  defaultModel?: string;
  taskModels: Partial<Record<AiTaskType, string>>;
  allowlist?: string[];
}

export const DEFAULT_FALLBACK_POLICY: AiFallbackPolicy = "alternate_any";

export function estimatePromptTokens(messages: AiMessage[]): number {
  const chars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  return Math.max(1, Math.round(chars / 4));
}

export function estimateCompletionTokens(input: AiRoutingInput): number {
  return input.maxTokens ?? 256;
}

export function estimateCost(model: RegisteredModel, input: AiRoutingInput): number {
  const prompt = estimatePromptTokens(input.messages);
  const completion = estimateCompletionTokens(input);
  const inputCost = (prompt / 1_000_000) * model.pricing.inputPerMToken;
  const outputCost = (completion / 1_000_000) * model.pricing.outputPerMToken;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export function enabledProviderIds(providers: Record<string, ProviderSettings>): string[] {
  return Object.keys(providers).filter((id) => providers[id].enabled && !!providers[id].baseUrl);
}

function providerOrder(providers: string[], ctx: RoutingContext, preferredProvider?: string): string[] {
  const preferred = preferredProvider && providers.includes(preferredProvider) ? preferredProvider : undefined;
  const sorted = [...providers].sort((a, b) => {
    const pa = a === preferred ? 0 : a === ctx.defaultProvider ? 1 : 2;
    const pb = b === preferred ? 0 : b === ctx.defaultProvider ? 1 : 2;
    return pa - pb || a.localeCompare(b);
  });
  return sorted;
}

function makeCandidate(provider: string, model: RegisteredModel, input: AiRoutingInput, primary: boolean): RouteCandidate {
  return {
    provider,
    model: model.id,
    estimatedCost: estimateCost(model, input),
    avgLatencyMs: model.avgLatencyMs,
    capabilities: model.capabilities ?? [],
    primary,
  };
}

export function buildCandidates(input: AiRoutingInput, ctx: RoutingContext): RouteCandidate[] {
  const providers = enabledProviderIds(ctx.providers);
  if (providers.length === 0) {
    throw new AiError("AI_NOT_CONFIGURED", "No AI providers are enabled for this workspace", { status: 400 });
  }

  const allowlist = ctx.allowlist;
  const assertAllowed = (modelId: string): void => {
    if (allowlist && allowlist.length > 0 && !allowlist.includes(modelId)) {
      throw new AiError("AI_MODEL_BLOCKED", `Model "${modelId}" is not in the workspace allowlist`, {
        status: 403,
        model: modelId,
      });
    }
  };
  if (input.preferredModel) assertAllowed(input.preferredModel);

  const primaryModelId =
    input.preferredModel ??
    (input.taskType ? ctx.taskModels[input.taskType] : undefined) ??
    ctx.defaultModel;

  const orderedProviders = providerOrder(providers, ctx, input.preferredProvider);
  const candidates: RouteCandidate[] = [];

  if (input.preferredModel) {
    // Explicit model override: pin to this model on eligible providers.
    for (const pid of orderedProviders) {
      const model = ctx.registry.resolve(pid, input.preferredModel);
      if (model) candidates.push(makeCandidate(pid, model, input, true));
    }
    if (candidates.length === 0) {
      throw new AiError("AI_MODEL_NOT_FOUND", `Model "${input.preferredModel}" is not available on any enabled provider`, {
        status: 400,
        model: input.preferredModel,
      });
    }
  } else if (primaryModelId) {
    // Workspace/task default model first, then cost/latency-ranked alternates.
    for (const pid of orderedProviders) {
      const model = ctx.registry.resolve(pid, primaryModelId);
      if (model) candidates.push(makeCandidate(pid, model, input, true));
    }
    for (const pid of orderedProviders) {
      for (const model of ctx.registry.list(pid)) {
        if (model.id === primaryModelId) continue;
        if (candidates.some((c) => c.provider === pid && c.model === model.id)) continue;
        candidates.push(makeCandidate(pid, model, input, false));
      }
    }
  } else {
    // No configured default: rank the full pool below.
    for (const pid of orderedProviders) {
      for (const model of ctx.registry.list(pid)) {
        candidates.push(makeCandidate(pid, model, input, false));
      }
    }
  }

  if (allowlist && allowlist.length > 0) {
    const allowed = candidates.filter((c) => allowlist.includes(c.model));
    if (allowed.length === 0) {
      throw new AiError("AI_MODEL_BLOCKED", "No models in the workspace allowlist are available for this request", {
        status: 403,
      });
    }
    return filterAndOrder(input, allowed, primaryModelId !== undefined, orderedProviders);
  }

  return filterAndOrder(input, candidates, primaryModelId !== undefined, orderedProviders);
}

function filterAndOrder(
  input: AiRoutingInput,
  candidates: RouteCandidate[],
  hasPrimary: boolean,
  orderedProviders: string[],
): RouteCandidate[] {
  let pool = candidates;

  if (input.capability) {
    const capable = pool.filter((c) => c.capabilities.includes(input.capability as AiCapability));
    if (capable.length === 0) {
      if (input.preferredModel) {
        throw new AiError(
          "AI_MODEL_NOT_FOUND",
          `Model "${input.preferredModel}" does not support capability "${input.capability}"`,
          { status: 400, model: input.preferredModel },
        );
      }
      throw new AiError("AI_MODEL_NOT_FOUND", `No model supports capability "${input.capability}"`, { status: 400 });
    }
    pool = capable;
  }

  if (input.maxCost !== undefined) {
    const affordable = pool.filter((c) => c.estimatedCost <= (input.maxCost as number));
    if (affordable.length === 0) {
      throw new AiError("AI_INVALID_REQUEST", `No model fits the maximum cost of $${input.maxCost}`, { status: 400 });
    }
    pool = affordable;
  }

  const latencyLow = input.latencyPreference === "low";
  const sortKey = (c: RouteCandidate): number =>
    latencyLow ? (c.avgLatencyMs ?? Number.POSITIVE_INFINITY) : c.estimatedCost;

  const providerIndex = new Map(orderedProviders.map((id, i) => [id, i]));
  const priority = (c: RouteCandidate): number => providerIndex.get(c.provider) ?? orderedProviders.length;

  // Preferred provider gets a boost so its candidates sort before others;
  // cost/latency then ranks within the boosted group and the rest.
  const preferred = input.preferredProvider;
  const boost = (c: RouteCandidate): number => (preferred && c.provider === preferred ? 0 : 1);
  const cmp = (a: RouteCandidate, b: RouteCandidate): number =>
    boost(a) - boost(b) || sortKey(a) - sortKey(b);

  const primaries = pool.filter((c) => c.primary);
  const alternates = pool.filter((c) => !c.primary);

  if (hasPrimary && primaries.length > 0) {
    const rankedPrimaries = [...primaries].sort((a, b) => priority(a) - priority(b) || sortKey(a) - sortKey(b));
    return [...rankedPrimaries, ...alternates.sort(cmp)];
  }
  return [...pool].sort(cmp);
}

export interface FailedAttempt {
  provider: string;
  model: string;
}

export function isFallbackAllowed(candidate: RouteCandidate, failed: FailedAttempt[], policy: AiFallbackPolicy): boolean {
  if (policy === "never") return false;
  if (candidate.primary && failed.length === 0) return true;
  const last = failed[failed.length - 1];
  if (!last) return true;
  if (policy === "alternate_provider") return candidate.provider !== last.provider;
  if (policy === "alternate_model") return candidate.model !== last.model;
  return true;
}
