import type { AiChatRequest, AiUsage } from "../types";
import type { AiProvider, ProviderCallOptions, ProviderPing, ProviderResult } from "./types";
import { mapHttpError, requestJson } from "./http";
import type { AiError } from "../errors";

interface OllamaChatData {
  created_at?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements AiProvider {
  readonly id = "ollama";
  readonly label = "Ollama";

  async chat(request: AiChatRequest, options: ProviderCallOptions): Promise<ProviderResult> {
    const url = `${options.baseUrl.replace(/\/$/, "")}/api/chat`;
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: false,
    };
    if (request.temperature !== undefined) payload.options = { temperature: request.temperature };

    try {
      const data = (await requestJson("POST", url, {
        body: payload,
        timeoutMs: options.timeoutMs,
        retries: options.retries,
      })) as OllamaChatData;
      const promptTokens = Number(data.prompt_eval_count ?? 0);
      const completionTokens = Number(data.eval_count ?? 0);
      const usage: AiUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
      return {
        id: data.created_at ?? "",
        content: data.message?.content ?? "",
        usage,
      };
    } catch (err) {
      throw mapHttpError(err as Error, this.id);
    }
  }

  async ping(options: ProviderCallOptions): Promise<ProviderPing> {
    const started = Date.now();
    const url = `${options.baseUrl.replace(/\/$/, "")}/api/tags`;
    try {
      await requestJson("GET", url, {
        timeoutMs: Math.min(options.timeoutMs, 5000),
        retries: 0,
      });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      const aiError = mapHttpError(err as Error, this.id) as AiError;
      return { ok: false, latencyMs: Date.now() - started, detail: aiError.code };
    }
  }
}
