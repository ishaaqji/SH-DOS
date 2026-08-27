import type { RegisteredModel } from "./types";

const DEFAULT_MODELS: RegisteredModel[] = [
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    pricing: { inputPerMToken: 2.5, outputPerMToken: 10 },
    capabilities: ["chat", "vision", "reasoning", "long_context"],
    avgLatencyMs: 800,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o mini",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    pricing: { inputPerMToken: 0.15, outputPerMToken: 0.6 },
    capabilities: ["chat", "vision", "long_context", "fast"],
    avgLatencyMs: 400,
  },
  {
    id: "llama3.2",
    provider: "ollama",
    displayName: "Llama 3.2",
    contextWindow: 128000,
    maxOutputTokens: 8192,
    pricing: { inputPerMToken: 0, outputPerMToken: 0 },
    capabilities: ["chat", "long_context"],
    avgLatencyMs: 120,
  },
  {
    id: "mistral",
    provider: "ollama",
    displayName: "Mistral",
    contextWindow: 32000,
    maxOutputTokens: 4096,
    pricing: { inputPerMToken: 0, outputPerMToken: 0 },
    capabilities: ["chat", "code", "fast"],
    avgLatencyMs: 90,
  },
];

export class ModelRegistry {
  private models = new Map<string, RegisteredModel>();

  constructor() {
    for (const model of DEFAULT_MODELS) this.register(model);
  }

  register(model: RegisteredModel): void {
    this.models.set(`${model.provider}:${model.id}`, model);
  }

  resolve(provider: string, modelId: string): RegisteredModel | undefined {
    return this.models.get(`${provider}:${modelId}`);
  }

  list(provider?: string): RegisteredModel[] {
    const all = [...this.models.values()];
    return provider ? all.filter((m) => m.provider === provider) : all;
  }
}
