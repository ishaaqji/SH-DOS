import type { EventBus } from "../../kernel/events";
import { newId } from "../../kernel/ids";
import type { IdentityService, User } from "../../identity/identity";
import type { AiGateway } from "../service";
import type { AiConfigStore } from "../config";
import type { ModelRegistry } from "../registry";
import type { AiProvider } from "../providers/types";
import type { AiChatResponse } from "../types";
import { AiError } from "../errors";
import {
  buildCandidates,
  DEFAULT_FALLBACK_POLICY,
  enabledProviderIds,
  isFallbackAllowed,
  type FailedAttempt,
  type RoutingContext,
} from "./policy";
import type { ProviderHealthMonitor } from "./health";
import type { RoutingAuditStore } from "./audit";
import type { AiFallbackPolicy, AiRoutingInput, RouteCandidate, RoutingDecision, RoutingAttempt } from "./types";

export interface AiRouterDeps {
  identity: IdentityService;
  bus: EventBus;
  gateway: AiGateway;
  config: AiConfigStore;
  registry: ModelRegistry;
  providers: Record<string, AiProvider>;
  health: ProviderHealthMonitor;
  audit: RoutingAuditStore;
  allowlist?: (workspaceId: string) => string[] | undefined;
}

const FALLBACK_TRIGGER_CODES = new Set([
  "AI_PROVIDER_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_RATE_LIMITED",
  "AI_AUTH_FAILED",
  "AI_PROVIDER_ERROR",
  "AI_MODEL_NOT_FOUND",
]);

function shouldFallback(code?: string): boolean {
  return !!code && FALLBACK_TRIGGER_CODES.has(code);
}

export class AiRouter {
  constructor(private deps: AiRouterDeps) {}

  private context(workspaceId: string): RoutingContext {
    const config = this.deps.config.get(workspaceId);
    const enabled = enabledProviderIds(config.providers);
    const providers: RoutingContext["providers"] = {};
    for (const id of enabled) providers[id] = config.providers[id];
    return {
      registry: this.deps.registry,
      providers,
      defaultProvider: config.defaultProvider,
      defaultModel: config.defaultModel,
      taskModels: config.taskModels ?? {},
      allowlist: this.deps.allowlist?.(workspaceId),
    };
  }

  private async healthOrder(workspaceId: string, candidates: RouteCandidate[]): Promise<RouteCandidate[]> {
    const healthy: RouteCandidate[] = [];
    const unhealthy: RouteCandidate[] = [];
    for (const c of candidates) {
      const ok = await this.deps.health.isHealthy(workspaceId, c.provider, () => this.ping(workspaceId, c.provider));
      (ok ? healthy : unhealthy).push(c);
    }
    // Preserve relative order within each bucket, healthy providers first.
    return [...healthy, ...unhealthy];
  }

  private async ping(workspaceId: string, providerId: string): Promise<boolean> {
    const adapter = this.deps.providers[providerId];
    if (!adapter) return false;
    try {
      const settings = this.deps.config.callSettings(workspaceId, providerId);
      if (!settings || !settings.baseUrl) return false;
      const result = await adapter.ping({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        timeoutMs: Math.min(settings.timeoutMs, 5000),
        retries: 0,
      });
      return result.ok;
    } catch {
      return false;
    }
  }

  async complete(user: User, workspaceId: string, input: AiRoutingInput): Promise<AiChatResponse> {
    this.deps.identity.authorize(user, workspaceId, "ai", "use");
    this.validateInput(input);

    const candidates = await this.healthOrder(workspaceId, buildCandidates(input, this.context(workspaceId)));
    const attempts: RoutingAttempt[] = [];
    const failed: FailedAttempt[] = [];
    const policy: AiFallbackPolicy = input.fallbackPolicy ?? DEFAULT_FALLBACK_POLICY;

    for (const candidate of candidates) {
      if (failed.length > 0 && !isFallbackAllowed(candidate, failed, policy)) continue;

      const attempt: RoutingAttempt = { provider: candidate.provider, model: candidate.model, ok: false };
      const started = Date.now();
      try {
        const response = await this.deps.gateway.chat(user, workspaceId, {
          provider: candidate.provider,
          model: candidate.model,
          messages: input.messages,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        });
        attempt.ok = true;
        attempt.latencyMs = Date.now() - started;
        attempts.push(attempt);
        await this.recordDecision(user, workspaceId, input, candidates, attempts, candidate, "ok");
        await this.deps.bus.emit({
          type: "ai.routed",
          aggregateId: newId("ai"),
          workspaceId,
          at: new Date(),
          payload: {
            provider: candidate.provider,
            model: candidate.model,
            actorId: user.id,
            attempts: attempts.map((a) => ({ ...a })),
          },
        });
        return response;
      } catch (err) {
        const aiError = err instanceof AiError ? err : new AiError("AI_PROVIDER_ERROR", String(err));
        attempt.errorCode = aiError.code;
        attempt.latencyMs = Date.now() - started;
        attempts.push(attempt);
        failed.push({ provider: candidate.provider, model: candidate.model });
        if (!shouldFallback(aiError.code)) {
          await this.recordDecision(user, workspaceId, input, candidates, attempts, candidate, "failed", aiError.code);
          throw aiError;
        }
      }
    }

    const lastError = new AiError("AI_PROVIDER_UNAVAILABLE", "All AI routing candidates failed", { status: 502 });
    await this.recordDecision(user, workspaceId, input, candidates, attempts, undefined, "failed", lastError.code);
    throw lastError;
  }

  async plan(user: User, workspaceId: string, input: AiRoutingInput): Promise<RouteCandidate[]> {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    this.validateInput(input);
    return buildCandidates(input, this.context(workspaceId));
  }

  decisions(user: User, workspaceId: string): RoutingDecision[] {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    return [...this.deps.audit.list(workspaceId)].reverse();
  }

  private validateInput(input: AiRoutingInput): void {
    if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
      throw new AiError("AI_INVALID_REQUEST", "messages must be a non-empty array", { status: 400 });
    }
    for (const m of input.messages) {
      if (!m || typeof m.content !== "string") {
        throw new AiError("AI_INVALID_REQUEST", "each message requires role and content", { status: 400 });
      }
    }
  }

  private async recordDecision(
    user: User,
    workspaceId: string,
    input: AiRoutingInput,
    candidates: RouteCandidate[],
    attempts: RoutingAttempt[],
    selected: RouteCandidate | undefined,
    status: "ok" | "failed",
    errorCode?: string,
  ): Promise<void> {
    this.deps.audit.record({
      workspaceId,
      actorId: user.id,
      input: {
        taskType: input.taskType,
        capability: input.capability,
        preferredProvider: input.preferredProvider,
        preferredModel: input.preferredModel,
        maxCost: input.maxCost,
        latencyPreference: input.latencyPreference,
        fallbackPolicy: input.fallbackPolicy,
      },
      candidates: candidates.map((c) => ({ ...c })),
      attempts,
      selected: selected ? { provider: selected.provider, model: selected.model } : undefined,
      status,
      errorCode,
    });
  }
}
