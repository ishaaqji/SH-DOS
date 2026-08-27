import type { EventBus } from "../kernel/events";
import { newId, now } from "../kernel/ids";
import type { IdentityService, User } from "../identity/identity";
import type { AiChatRequest, AiChatResponse, RegisteredModel, UsageRecord } from "./types";
import type { AiProvider } from "./providers/types";
import type { AiConfigStore, PublicAiConfig } from "./config";
import type { ModelRegistry } from "./registry";
import type { UsageMeter, UsageSummary } from "./metering";
import type { QuotaEnforcer } from "./quota";
import { AiError } from "./errors";
import type { AiTaskType, ProviderSettings, QuotaLimits } from "./types";

export interface ProviderStatus {
  providerId: string;
  label: string;
  enabled: boolean;
  defaultModel?: string;
  baseUrl: string;
  healthy: boolean;
  latencyMs?: number;
  detail?: string;
}

export interface AiStatus {
  workspaceId: string;
  defaultProvider: string;
  providers: ProviderStatus[];
  quota: QuotaLimits;
  usage: UsageSummary;
  models: RegisteredModel[];
}

export interface AiGatewayDeps {
  identity: IdentityService;
  bus: EventBus;
  config: AiConfigStore;
  registry: ModelRegistry;
  meter: UsageMeter;
  quota: QuotaEnforcer;
  providers: Record<string, AiProvider>;
}

export interface ConfigUpdateInput {
  providerId?: string;
  settings?: Partial<Omit<ProviderSettings, "providerId">>;
  defaultProvider?: string;
  defaultModel?: string;
  taskModels?: Partial<Record<AiTaskType, string>>;
  quota?: QuotaLimits;
}

export class AiGateway {
  constructor(private deps: AiGatewayDeps) {}

  async chat(user: User, workspaceId: string, request: AiChatRequest): Promise<AiChatResponse> {
    this.deps.identity.authorize(user, workspaceId, "ai", "use");
    this.validateRequest(request);

    const config = this.deps.config.get(workspaceId);
    const providerId = request.provider?.trim() || config.defaultProvider;
    const provider = this.deps.providers[providerId];
    if (!provider) {
      throw new AiError("AI_NOT_CONFIGURED", `AI provider "${providerId}" is not available`, { status: 400 });
    }
    const settings = this.deps.config.callSettings(workspaceId, providerId);
    if (!settings || !settings.enabled) {
      throw new AiError("AI_NOT_CONFIGURED", `AI provider "${providerId}" is not enabled`, { status: 400 });
    }
    const model = this.deps.registry.resolve(providerId, request.model);
    if (!model) {
      throw new AiError("AI_MODEL_NOT_FOUND", `Model "${request.model}" is not registered for provider "${providerId}"`, {
        status: 400,
        provider: providerId,
        model: request.model,
      });
    }

    this.deps.quota.assertCanRequest(workspaceId);

    const started = Date.now();
    let result;
    let failure: AiError | undefined;
    try {
      result = await provider.chat(request, {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        timeoutMs: settings.timeoutMs,
        retries: settings.retries,
      });
    } catch (err) {
      failure = err instanceof AiError ? err : new AiError("AI_PROVIDER_ERROR", String(err));
      this.recordUsage(user, workspaceId, providerId, request.model, {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        ok: false,
        errorCode: failure.code,
        latencyMs: Date.now() - started,
      });
      await this.emitAudit(workspaceId, "ai.error", {
        providerId,
        model: request.model,
        actorId: user.id,
        errorCode: failure.code,
        message: failure.message,
        latencyMs: Date.now() - started,
      });
      throw failure;
    }

    const cost = this.computeCost(model, result.usage);
    const response: AiChatResponse = {
      id: result.id || newId("ai"),
      provider: providerId,
      model: request.model,
      content: result.content,
      usage: result.usage,
      cost,
      createdAt: now(),
    };

    this.recordUsage(user, workspaceId, providerId, request.model, {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      cost,
      ok: true,
      latencyMs: Date.now() - started,
    });
    await this.emitAudit(workspaceId, "ai.completed", {
      providerId,
      model: request.model,
      actorId: user.id,
      usage: result.usage,
      cost,
      latencyMs: Date.now() - started,
    });
    return response;
  }

  async status(user: User, workspaceId: string): Promise<AiStatus> {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    const config = this.deps.config.get(workspaceId);
    const providers: ProviderStatus[] = [];

    for (const [providerId, settings] of Object.entries(config.providers)) {
      const base: ProviderStatus = {
        providerId,
        label: settings.label,
        enabled: settings.enabled,
        defaultModel: settings.defaultModel,
        baseUrl: settings.baseUrl,
        healthy: false,
      };
      const adapter = this.deps.providers[providerId];
      if (adapter && settings.enabled && settings.baseUrl) {
        const ping = await adapter.ping({
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          timeoutMs: settings.timeoutMs,
          retries: 0,
        });
        base.healthy = ping.ok;
        base.latencyMs = ping.latencyMs;
        base.detail = ping.detail;
      }
      providers.push(base);
    }

    return {
      workspaceId,
      defaultProvider: config.defaultProvider,
      providers,
      quota: config.quota,
      usage: this.deps.meter.summary(workspaceId),
      models: this.deps.registry.list(),
    };
  }

  getConfig(user: User, workspaceId: string): PublicAiConfig {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    return this.deps.config.publicView(workspaceId);
  }

  updateConfig(user: User, workspaceId: string, input: ConfigUpdateInput): PublicAiConfig {
    this.deps.identity.authorize(user, workspaceId, "ai", "manage");
    if (input.providerId && input.settings) {
      this.deps.config.updateProvider(workspaceId, input.providerId, input.settings);
    }
    if (input.defaultProvider) {
      this.deps.config.setDefaultProvider(workspaceId, input.defaultProvider);
    }
    if (input.defaultModel) {
      this.deps.config.setDefaultModel(workspaceId, input.defaultModel);
    }
    if (input.taskModels) {
      for (const [task, model] of Object.entries(input.taskModels)) {
        if (model) this.deps.config.setTaskModel(workspaceId, task as AiTaskType, model);
      }
    }
    if (input.quota) {
      this.deps.config.updateQuota(workspaceId, input.quota);
    }
    return this.deps.config.publicView(workspaceId);
  }

  usage(user: User, workspaceId: string): { summary: UsageSummary; today: UsageSummary; recent: UsageRecord[] } {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    const records = this.deps.meter.list(workspaceId);
    const today = this.deps.meter.today(workspaceId);
    return {
      summary: this.deps.meter.summary(workspaceId, records),
      today: this.deps.meter.summary(workspaceId, today),
      recent: [...records].reverse().slice(0, 20),
    };
  }

  private validateRequest(request: AiChatRequest): void {
    if (!request || typeof request.model !== "string" || !request.model.trim()) {
      throw new AiError("AI_INVALID_REQUEST", "model is required", { status: 400 });
    }
    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      throw new AiError("AI_INVALID_REQUEST", "messages must be a non-empty array", { status: 400 });
    }
    for (const message of request.messages) {
      if (!message || typeof message.content !== "string") {
        throw new AiError("AI_INVALID_REQUEST", "each message requires role and content", { status: 400 });
      }
    }
  }

  private computeCost(model: RegisteredModel, usage: { promptTokens: number; completionTokens: number }): number {
    const input = (usage.promptTokens / 1_000_000) * model.pricing.inputPerMToken;
    const output = (usage.completionTokens / 1_000_000) * model.pricing.outputPerMToken;
    return Math.round((input + output) * 1_000_000) / 1_000_000;
  }

  private recordUsage(
    user: User,
    workspaceId: string,
    providerId: string,
    model: string,
    input: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
      ok: boolean;
      errorCode?: string;
      latencyMs?: number;
    },
  ): UsageRecord {
    return this.deps.meter.record({
      workspaceId,
      providerId,
      model,
      actorId: user.id,
      ...input,
    });
  }

  private async emitAudit(workspaceId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.bus.emit({
      type,
      aggregateId: newId("ai"),
      workspaceId,
      at: new Date(),
      payload,
    });
  }
}
