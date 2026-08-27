import type { AiChatRequest, AiUsage } from "../types";
import type { AiProvider, ProviderCallOptions, ProviderPing, ProviderResult } from "./types";
import { mapHttpError, requestJson } from "./http";
import type { AiError } from "../errors";

function toUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): AiUsage {
  const promptTokens = Number(usage?.prompt_tokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(usage?.total_tokens ?? promptTokens + completionTokens),
  };
}

export class OpenAIProvider implements AiProvider {
  readonly id = "openai";
  readonly label = "OpenAI";

  async chat(request: AiChatRequest, options: ProviderCallOptions): Promise<ProviderResult> {
    const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens;

    try {
      const data = (await requestJson("POST", url, {
        headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
        body: payload,
        timeoutMs: options.timeoutMs,
        retries: options.retries,
      })) as { id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      return {
        id: data.id ?? "",
        content: data.choices?.[0]?.message?.content ?? "",
        usage: toUsage(data.usage),
      };
    } catch (err) {
      throw mapHttpError(err as Error, this.id);
    }
  }

  async ping(options: ProviderCallOptions): Promise<ProviderPing> {
    const started = Date.now();
    const url = `${options.baseUrl.replace(/\/$/, "")}/models`;
    try {
      await requestJson("GET", url, {
        headers: options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
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
