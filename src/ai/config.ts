import { MemoryStore, type Store } from "../kernel/store";
import { now } from "../kernel/ids";
import type { AiTaskType, ProviderSettings, QuotaLimits, WorkspaceAiConfig } from "./types";

export interface PublicProviderSettings {
  providerId: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  defaultModel?: string;
  timeoutMs: number;
  retries: number;
}

export interface PublicAiConfig {
  workspaceId: string;
  defaultProvider: string;
  defaultModel?: string;
  taskModels?: Partial<Record<AiTaskType, string>>;
  providers: Record<string, PublicProviderSettings>;
  quota: QuotaLimits;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

function defaultProviders(): Record<string, ProviderSettings> {
  return {
    openai: {
      providerId: "openai",
      label: "OpenAI",
      baseUrl: process.env.AI_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.AI_OPENAI_API_KEY,
      enabled: true,
      defaultModel: "gpt-4o-mini",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: DEFAULT_RETRIES,
    },
    ollama: {
      providerId: "ollama",
      label: "Ollama",
      baseUrl: process.env.AI_OLLAMA_BASE_URL ?? "http://localhost:11434",
      enabled: true,
      defaultModel: "llama3.2",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: DEFAULT_RETRIES,
    },
  };
}

const DEFAULT_QUOTA: QuotaLimits = {
  requestsPerDay: 1000,
  tokensPerDay: 1_000_000,
  costPerDay: 10,
};

export class AiConfigStore {
  constructor(private store: Store<WorkspaceAiConfig> = new MemoryStore<WorkspaceAiConfig>()) {}

  get(workspaceId: string): WorkspaceAiConfig {
    const existing = this.store.get(workspaceId);
    if (existing) return existing;
    const config: WorkspaceAiConfig = {
      id: workspaceId,
      workspaceId,
      defaultProvider: "openai",
      providers: defaultProviders(),
      quota: { ...DEFAULT_QUOTA },
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.insert(config);
    return this.get(workspaceId);
  }

  callSettings(workspaceId: string, providerId: string): ProviderSettings | undefined {
    return this.get(workspaceId).providers[providerId];
  }

  updateProvider(
    workspaceId: string,
    providerId: string,
    patch: Partial<Omit<ProviderSettings, "providerId">>,
  ): WorkspaceAiConfig {
    const config = this.get(workspaceId);
    const existing = config.providers[providerId] ?? {
      providerId,
      label: providerId,
      baseUrl: "",
      enabled: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retries: DEFAULT_RETRIES,
    };
    const providers = { ...config.providers, [providerId]: { ...existing, ...patch, providerId } };
    return this.store.update(workspaceId, { providers });
  }

  setDefaultProvider(workspaceId: string, providerId: string): WorkspaceAiConfig {
    this.get(workspaceId);
    return this.store.update(workspaceId, { defaultProvider: providerId });
  }

  setDefaultModel(workspaceId: string, modelId: string): WorkspaceAiConfig {
    this.get(workspaceId);
    return this.store.update(workspaceId, { defaultModel: modelId });
  }

  setTaskModel(workspaceId: string, taskType: AiTaskType, modelId: string): WorkspaceAiConfig {
    const config = this.get(workspaceId);
    return this.store.update(workspaceId, {
      taskModels: { ...config.taskModels, [taskType]: modelId },
    });
  }

  updateQuota(workspaceId: string, quota: QuotaLimits): WorkspaceAiConfig {
    const config = this.get(workspaceId);
    return this.store.update(workspaceId, { quota: { ...config.quota, ...quota } });
  }

  publicView(workspaceId: string): PublicAiConfig {
    const config = this.get(workspaceId);
    const providers: Record<string, PublicProviderSettings> = {};
    for (const [id, p] of Object.entries(config.providers)) {
      providers[id] = {
        providerId: p.providerId,
        label: p.label,
        baseUrl: p.baseUrl,
        enabled: p.enabled,
        defaultModel: p.defaultModel,
        timeoutMs: p.timeoutMs,
        retries: p.retries,
      };
    }
    return {
      workspaceId,
      defaultProvider: config.defaultProvider,
      defaultModel: config.defaultModel,
      taskModels: config.taskModels,
      providers,
      quota: config.quota,
    };
  }
}
