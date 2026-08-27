import type { AiChatRequest, AiUsage } from "../types";

export interface ProviderCallOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  retries: number;
}

export interface ProviderResult {
  id: string;
  content: string;
  usage: AiUsage;
}

export interface ProviderPing {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  chat(request: AiChatRequest, options: ProviderCallOptions): Promise<ProviderResult>;
  ping(options: ProviderCallOptions): Promise<ProviderPing>;
}
