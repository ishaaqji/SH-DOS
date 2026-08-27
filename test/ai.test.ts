import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import type { IdentityService, User, Workspace } from "../src/identity/identity";
import { OpenAIProvider } from "../src/ai/providers/openai";
import { OllamaProvider } from "../src/ai/providers/ollama";
import { AiError } from "../src/ai/errors";
import type { AiChatRequest } from "../src/ai/types";

const openServers: Server[] = [];
after(() => {
  for (const server of openServers) {
    server.closeAllConnections?.();
    server.close();
  }
});

interface MockProvider {
  base: string;
  calls: Array<{ url: string; body: any; headers: Record<string, string | undefined> }>;
  respond: (handler: (req: { url?: string; body: any; headers: any }) => { status: number; json: unknown }) => void;
}

async function startMockProvider(): Promise<MockProvider> {
  const calls: MockProvider["calls"] = [];
  let handler: (req: { url?: string; body: any; headers: any }) => { status: number; json: unknown } = () => ({
    status: 500,
    json: { error: "unconfigured" },
  });

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
      calls.push({ url: req.url ?? "", body, headers: req.headers as Record<string, string | undefined> });
      const result = handler({ url: req.url ?? "", body, headers: req.headers });
      const payload = JSON.stringify(result.json);
      res.writeHead(result.status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      });
      res.end(payload);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(server);
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    calls,
    respond: (h) => {
      handler = h;
    },
  };
}

interface Harness {
  app: ReturnType<typeof createApp>;
  identity: IdentityService;
  owner: User;
  editor: User;
  author: User;
  workspace: Workspace;
}

function setup(): Harness {
  const app = createApp();
  return {
    app,
    identity: app.identity,
    owner: app.identity.getUser("u_owner"),
    editor: app.identity.getUser("u_editor"),
    author: app.identity.getUser("u_author"),
    workspace: app.identity.listWorkspaces()[0],
  };
}

function chatRequest(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

test("OpenAI provider normalizes chat completions response", async () => {
  const mock = await startMockProvider();
  mock.respond(({ url }) => {
    assert.equal(url, "/chat/completions");
    return {
      status: 200,
      json: {
        id: "chatcmpl-123",
        choices: [{ message: { role: "assistant", content: "Hi there" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    };
  });

  const provider = new OpenAIProvider();
  const result = await provider.chat(chatRequest(), {
    baseUrl: mock.base,
    apiKey: "sk-test",
    timeoutMs: 2000,
    retries: 0,
  });

  assert.equal(result.id, "chatcmpl-123");
  assert.equal(result.content, "Hi there");
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  assert.equal(mock.calls[0].headers.authorization, "Bearer sk-test");
});

test("OpenAI provider sends normalized payload", async () => {
  const mock = await startMockProvider();
  mock.respond(() => ({
    status: 200,
    json: { id: "x", choices: [{ message: { content: "ok" } }], usage: {} },
  }));

  const provider = new OpenAIProvider();
  await provider.chat(
    chatRequest({ temperature: 0.7, maxTokens: 128 }),
    { baseUrl: mock.base, apiKey: undefined, timeoutMs: 2000, retries: 0 },
  );

  const sent = mock.calls[0].body;
  assert.equal(sent.model, "gpt-4o-mini");
  assert.equal(sent.temperature, 0.7);
  assert.equal(sent.max_tokens, 128);
  assert.deepEqual(sent.messages, [{ role: "user", content: "Hello" }]);
});

test("Ollama provider normalizes chat response and usage", async () => {
  const mock = await startMockProvider();
  mock.respond(({ url }) => {
    assert.equal(url, "/api/chat");
    return {
      status: 200,
      json: {
        created_at: "2026-01-01T00:00:00Z",
        model: "llama3.2",
        message: { role: "assistant", content: "Namaste" },
        prompt_eval_count: 22,
        eval_count: 9,
      },
    };
  });

  const provider = new OllamaProvider();
  const result = await provider.chat(chatRequest({ model: "llama3.2" }), {
    baseUrl: mock.base,
    apiKey: undefined,
    timeoutMs: 2000,
    retries: 0,
  });

  assert.equal(result.content, "Namaste");
  assert.deepEqual(result.usage, { promptTokens: 22, completionTokens: 9, totalTokens: 31 });
  assert.equal(mock.calls[0].body.stream, false);
  assert.equal(mock.calls[0].body.model, "llama3.2");
});

test("providers retry retryable HTTP 5xx then succeed", async () => {
  const mock = await startMockProvider();
  let count = 0;
  mock.respond(() => {
    count += 1;
    if (count < 3) return { status: 500, json: { error: "boom" } };
    return { status: 200, json: { id: "x", choices: [{ message: { content: "recovered" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } };
  });

  const provider = new OpenAIProvider();
  const result = await provider.chat(chatRequest(), { baseUrl: mock.base, apiKey: undefined, timeoutMs: 2000, retries: 3 });
  assert.equal(result.content, "recovered");
  assert.equal(count, 3);
});

test("providers do not retry non-retryable 4xx errors", async () => {
  const mock = await startMockProvider();
  let count = 0;
  mock.respond(() => {
    count += 1;
    return { status: 400, json: { error: { message: "bad request" } } };
  });

  const provider = new OpenAIProvider();
  await assert.rejects(
    provider.chat(chatRequest(), { baseUrl: mock.base, apiKey: undefined, timeoutMs: 2000, retries: 3 }),
    (err: AiError) => {
      assert.equal(err.code, "AI_PROVIDER_ERROR");
      assert.equal(err.retryable, false);
      return true;
    },
  );
  assert.equal(count, 1);
});

test("providers map auth failures and rate limits", async () => {
  const mock = await startMockProvider();
  mock.respond(() => ({ status: 401, json: { error: { message: "unauthorized" } } }));
  const provider = new OpenAIProvider();
  await assert.rejects(
    provider.chat(chatRequest(), { baseUrl: mock.base, apiKey: "bad", timeoutMs: 2000, retries: 0 }),
    (err: AiError) => err.code === "AI_AUTH_FAILED",
  );

  mock.respond(() => ({ status: 429, json: { error: { message: "rate limited" } } }));
  await assert.rejects(
    provider.chat(chatRequest(), { baseUrl: mock.base, apiKey: "bad", timeoutMs: 2000, retries: 0 }),
    (err: AiError) => err.code === "AI_RATE_LIMITED" && err.retryable === true,
  );
});

test("providers throw timeout error when provider is slow", async () => {
  const server = createServer((_req, res) => {
    // Never respond
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    }, 3000);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(server);
  const { port } = server.address() as AddressInfo;

  const provider = new OpenAIProvider();
  const started = Date.now();
  await assert.rejects(
    provider.chat(chatRequest(), { baseUrl: `http://127.0.0.1:${port}`, apiKey: undefined, timeoutMs: 150, retries: 0 }),
    (err: AiError) => err.code === "AI_TIMEOUT" && err.retryable === true,
  );
  assert.ok(Date.now() - started < 2500);
});

test("gateway chat authorizes, meters usage and computes cost", async () => {
  const { app, owner, author, workspace } = setup();
  const mock = await startMockProvider();
  mock.respond(() => ({
    status: 200,
    json: {
      id: "chatcmpl-abc",
      choices: [{ message: { content: "Hello from AI" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 2000, total_tokens: 3000 },
    },
  }));

  app.ai.updateConfig(owner, workspace.id, {
    providerId: "openai",
    settings: { baseUrl: mock.base, apiKey: "sk-test", enabled: true },
  });

  const result = await app.ai.chat(author, workspace.id, chatRequest());
  assert.equal(result.content, "Hello from AI");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.cost, 0.00135);

  const usage = app.ai.usage(author, workspace.id);
  assert.equal(usage.summary.requests, 1);
  assert.equal(usage.summary.totalTokens, 3000);
  assert.equal(usage.summary.cost, 0.00135);
  assert.equal(usage.recent[0].actorId, author.id);
});

test("gateway rejects unknown model and unknown provider", async () => {
  const { app, author, workspace } = setup();
  await assert.rejects(
    app.ai.chat(author, workspace.id, chatRequest({ model: "gpt-99" })),
    (err: AiError) => err.code === "AI_MODEL_NOT_FOUND",
  );
  await assert.rejects(
    app.ai.chat(author, workspace.id, chatRequest({ provider: "anthropic" })),
    (err: AiError) => err.code === "AI_NOT_CONFIGURED",
  );
  await assert.rejects(
    app.ai.chat(author, workspace.id, { model: "gpt-4o-mini", messages: [] }),
    (err: AiError) => err.code === "AI_INVALID_REQUEST",
  );
});

test("quota enforcement rejects when request limit reached", async () => {
  const { app, owner, author, workspace } = setup();
  const mock = await startMockProvider();
  mock.respond(() => ({
    status: 200,
    json: { id: "x", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
  }));

  app.ai.updateConfig(owner, workspace.id, {
    providerId: "openai",
    settings: { baseUrl: mock.base, apiKey: "sk-test", enabled: true },
    quota: { requestsPerDay: 2, tokensPerDay: 1_000_000, costPerDay: 100 },
  });

  await app.ai.chat(author, workspace.id, chatRequest());
  await app.ai.chat(author, workspace.id, chatRequest());
  await assert.rejects(
    app.ai.chat(author, workspace.id, chatRequest()),
    (err: AiError) => err.code === "AI_QUOTA_EXCEEDED" && err.status === 429,
  );
});

test("quota enforcement rejects when token limit reached", async () => {
  const { app, owner, author, workspace } = setup();
  const mock = await startMockProvider();
  mock.respond(() => ({
    status: 200,
    json: { id: "x", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 600, completion_tokens: 600 } },
  }));

  app.ai.updateConfig(owner, workspace.id, {
    providerId: "openai",
    settings: { baseUrl: mock.base, apiKey: "sk-test", enabled: true },
    quota: { requestsPerDay: 100, tokensPerDay: 1000, costPerDay: 100 },
  });

  await app.ai.chat(author, workspace.id, chatRequest());
  await assert.rejects(
    app.ai.chat(author, workspace.id, chatRequest()),
    (err: AiError) => err.code === "AI_QUOTA_EXCEEDED",
  );
});

test("tenant isolation: config and usage stay scoped per workspace", async () => {
  const { app, owner, author, workspace } = setup();
  const mockA = await startMockProvider();
  mockA.respond(() => ({
    status: 200,
    json: { id: "a", choices: [{ message: { content: "from A" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  }));

  app.ai.updateConfig(owner, workspace.id, {
    providerId: "openai",
    settings: { baseUrl: mockA.base, apiKey: "sk-A", enabled: true },
  });

  const other = app.identity.createWorkspace({ name: "Other", slug: "other-tenant", ownerId: owner.id });

  const result = await app.ai.chat(author, workspace.id, chatRequest());
  assert.equal(result.content, "from A");

  const usageA = app.ai.usage(author, workspace.id);
  assert.equal(usageA.summary.requests, 1);

  const usageOther = app.ai.usage(owner, other.id);
  assert.equal(usageOther.summary.requests, 0);

  const configA = app.ai.getConfig(owner, workspace.id);
  assert.ok(!("apiKey" in configA.providers.openai));
  assert.ok(!("apiKey" in configA.providers.ollama));

  const configOther = app.ai.getConfig(owner, other.id);
  assert.notEqual(configOther.providers.openai.baseUrl, mockA.base);
  assert.equal(configOther.providers.openai.enabled, true);
});

test("tenant isolation: RBAC prevents cross-tenant management", async () => {
  const { app, owner, workspace } = setup();
  const other = app.identity.createWorkspace({ name: "Other", slug: "other-rbac", ownerId: owner.id });

  const outsider = app.identity.createUser({
    email: "outsider@shdos.test",
    name: "Outsider",
    memberships: [{ workspaceId: other.id, roles: ["author"] }],
  });

  assert.throws(
    () => app.ai.updateConfig(outsider, workspace.id, { providerId: "openai", settings: { baseUrl: "http://evil" } }),
    (err: AiError) => err.code === "FORBIDDEN",
  );
  await assert.rejects(
    app.ai.chat(outsider, workspace.id, chatRequest()),
    (err: AiError) => err.code === "FORBIDDEN",
  );
});

test("status reports provider health without exposing secrets", async () => {
  const { app, owner, workspace } = setup();
  const mock = await startMockProvider();
  mock.respond(() => ({ status: 200, json: { ok: true } }));

  app.ai.updateConfig(owner, workspace.id, {
    providerId: "openai",
    settings: { baseUrl: mock.base, apiKey: "sk-secret", enabled: true },
  });
  app.ai.updateConfig(owner, workspace.id, {
    providerId: "ollama",
    settings: { enabled: false },
  });

  const status = await app.ai.status(owner, workspace.id);
  const openai = status.providers.find((p) => p.providerId === "openai");
  assert.ok(openai);
  assert.equal(openai.healthy, true);
  assert.ok(!("apiKey" in openai));

  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes("sk-secret"));
  assert.ok(status.models.some((m) => m.id === "gpt-4o"));
});

test("config management is gated by ai:manage", async () => {
  const { app, author, workspace } = setup();
  assert.throws(
    () => app.ai.updateConfig(author, workspace.id, { quota: { requestsPerDay: 5 } }),
    (err: AiError) => err.code === "FORBIDDEN",
  );
});
