import { AiError, errMessage } from "../errors";

export interface HttpRequestOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export class HttpStatusError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
    this.body = body;
  }
}

export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isRetryableHttpError(err: unknown): boolean {
  if (err instanceof HttpTimeoutError) return true;
  if (err instanceof HttpStatusError) {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(
  method: string,
  url: string,
  options: Required<Pick<HttpRequestOptions, "timeoutMs">> & HttpRequestOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const headers: Record<string, string> = { accept: "application/json", ...options.headers };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    if (!res.ok) {
      throw new HttpStatusError(res.status, `HTTP ${res.status}: ${text.slice(0, 200)}`, json);
    }
    return json;
  } catch (err) {
    if (err instanceof HttpStatusError) throw err;
    if ((err as Error).name === "AbortError") throw new HttpTimeoutError(options.timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson(method: string, url: string, options: HttpRequestOptions = {}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 100;
  let lastError: unknown;

  for (let attemptCount = 0; attemptCount <= retries; attemptCount++) {
    if (attemptCount > 0) await sleep(backoffMs * attemptCount);
    try {
      return await attempt(method, url, { ...options, timeoutMs });
    } catch (err) {
      if (!isRetryableHttpError(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export function mapHttpError(err: unknown, provider: string): AiError {
  if (err instanceof HttpTimeoutError) {
    return new AiError("AI_TIMEOUT", err.message, { provider, retryable: true, status: 504 });
  }
  if (err instanceof HttpStatusError) {
    if (err.status === 401 || err.status === 403) {
      return new AiError("AI_AUTH_FAILED", err.message, { provider, status: 502 });
    }
    if (err.status === 404) {
      return new AiError("AI_MODEL_NOT_FOUND", err.message, { provider, status: 502 });
    }
    if (err.status === 429) {
      return new AiError("AI_RATE_LIMITED", err.message, { provider, retryable: true, status: 429 });
    }
    if (err.status >= 500) {
      return new AiError("AI_PROVIDER_UNAVAILABLE", err.message, { provider, retryable: true, status: 502 });
    }
    return new AiError("AI_PROVIDER_ERROR", err.message, { provider, status: 502 });
  }
  return new AiError("AI_PROVIDER_UNAVAILABLE", errMessage(err), { provider, retryable: true, status: 502 });
}
