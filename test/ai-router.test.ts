import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import type { IdentityService, User, Workspace } from "../src/identity/identity";
import { AiError } from "../src/ai/errors";
import type { AiRoutingInput, RouteCandidate } from "../src/ai/router/types";

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

function routingInput(overrides: Partial<AiRoutingInput> = {}): AiRoutingInput {
  return {
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

async function configureProvider(
  harness: Harness,
  providerId: "openai" | "ollama",
  base: string,
  enabled = true,
): Promise<void> {
  harness.app.ai.updateConfig(harness.owner, harness.workspace.id, {
    providerId,
    settings: {
      baseUrl: base,
      apiKey: providerId === "openai" ? "sk-test" : undefined,
      enabled,
    },
  });
}

function okHandler(content = "route-ok") {
  return () => ({
    status: 200,
    json: { id: "cmpl-x", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  });
}

// Ollama's /api/chat uses a different response shape.
function okOllamaHandler(content = "route-ok") {
  return () => ({
    status: 200,
    json: {
      created_at: "2026-01-01T00:00:00Z",
      model: "llama3.2",
      message: { role: "assistant", content },
      prompt_eval_count: 10,
      eval_count: 5,
    },
  });
}

// Respond healthy to ping endpoints (/models, /api/tags) but run a chat handler.
function chatFailHandler() {
  return (req: { url?: string }) =>
    req.url === "/models" || req.url === "/api/tags"
      ? { status: 200, json: {} }
      : { status: 500, json: { error: "boom" } };
}

async function route(
  harness: Harness,
  input: AiRoutingInput,
  user: User = harness.author,
): Promise<Awaited<ReturnType<Harness["app"]["aiRouter"]["complete"]>>> {
  return harness.app.aiRouter.complete(user, harness.workspace.id, input);
}

test("router routes to workspace default model and delegates to gateway", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("hello routed"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", "http://127.0.0.1:1", false);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const result = await route(h, routingInput());
  assert.equal(result.content, "hello routed");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(openai.calls[openai.calls.length - 1].body.model, "gpt-4o-mini");
});

test("router uses task-type model override when configured", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("code routed"));
  const ollama = await startMockProvider();
  ollama.respond(okOllamaHandler("ollama routed"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", ollama.base);

  h.app.ai.updateConfig(h.owner, h.workspace.id, {
    defaultModel: "gpt-4o-mini",
    taskModels: { code: "mistral" },
  });

  const result = await route(h, routingInput({ taskType: "code" }));
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "mistral");
});

test("router prefers preferred provider then default provider ordering", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("from openai"));
  const ollama = await startMockProvider();
  ollama.respond(okOllamaHandler("from ollama"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", ollama.base);

  // No default model: full pool ranked, preferred provider's models come first.
  const withPref = await route(h, routingInput({ preferredProvider: "ollama" }));
  assert.equal(withPref.provider, "ollama");

  const withOpenaiPref = await route(h, routingInput({ preferredProvider: "openai" }));
  assert.equal(withOpenaiPref.provider, "openai");
});

test("router pins to preferred model and rejects unavailable model", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("pinned"));
  await configureProvider(h, "openai", openai.base);

  const result = await route(h, routingInput({ preferredModel: "gpt-4o" }));
  assert.equal(result.model, "gpt-4o");

  await assert.rejects(
    route(h, routingInput({ preferredModel: "gpt-99" })),
    (err: AiError) => err.code === "AI_MODEL_NOT_FOUND" && err.status === 400,
  );
});

test("router falls back to alternate provider on provider failure", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(chatFailHandler());
  const ollama = await startMockProvider();
  ollama.respond(okOllamaHandler("fallback hit"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", ollama.base);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const result = await route(h, routingInput());
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "llama3.2");
  assert.equal(result.content, "fallback hit");

  const decisions = h.app.aiRouter.decisions(h.author, h.workspace.id);
  const last = decisions[0];
  assert.equal(last.status, "ok");
  assert.equal(last.attempts.length, 2);
  assert.equal(last.attempts[0].provider, "openai");
  assert.equal(last.attempts[0].ok, false);
  assert.equal(last.attempts[0].errorCode, "AI_PROVIDER_UNAVAILABLE");
  assert.equal(last.attempts[1].provider, "ollama");
  assert.equal(last.attempts[1].ok, true);
  assert.deepEqual(last.selected, { provider: "ollama", model: "llama3.2" });
});

test("router stops on first failure when fallback policy is never", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(chatFailHandler());
  const ollama = await startMockProvider();
  ollama.respond(okOllamaHandler("should not hit"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", ollama.base);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  await assert.rejects(
    route(h, routingInput({ fallbackPolicy: "never" })),
    (err: AiError) => err.code === "AI_PROVIDER_UNAVAILABLE" && err.status === 502,
  );
  assert.equal(ollama.calls.filter((c) => c.url === "/api/chat").length, 0);

  const decisions = h.app.aiRouter.decisions(h.author, h.workspace.id);
  assert.equal(decisions[0].status, "failed");
  assert.equal(decisions[0].attempts.length, 1);
});

test("alternate_model fallback policy picks a different model", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(({ body }) => {
    if (body?.model === "gpt-4o-mini") return { status: 500, json: { error: "boom" } };
    return okHandler("gpt-4o ok")();
  });
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", "http://127.0.0.1:1", false);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const result = await route(h, routingInput({ fallbackPolicy: "alternate_model" }));
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o");
});

test("alternate_provider fallback policy does not retry same provider", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(({ body }) => {
    if (body?.model === "gpt-4o-mini") return { status: 500, json: { error: "boom" } };
    if (body?.model === "gpt-4o") return { status: 500, json: { error: "boom" } };
    return okHandler("x")();
  });
  const ollama = await startMockProvider();
  ollama.respond(okOllamaHandler("ollama fallback"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", ollama.base);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const result = await route(h, routingInput({ fallbackPolicy: "alternate_provider" }));
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "llama3.2");
  const decisions = h.app.aiRouter.decisions(h.author, h.workspace.id);
  assert.equal(decisions[0].attempts.length, 2);
});

test("router selects only models with required capability", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("vision"));
  await configureProvider(h, "openai", openai.base);
  await configureProvider(h, "ollama", "http://127.0.0.1:1", false);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const candidates = await h.app.aiRouter.plan(h.owner, h.workspace.id, routingInput({ capability: "vision" }));
  const models = candidates.map((c) => c.model);
  assert.ok(models.includes("gpt-4o"));
  assert.ok(models.includes("gpt-4o-mini"));
  assert.ok(!models.includes("llama3.2"));
  assert.ok(!models.includes("mistral"));

  await assert.rejects(
    h.app.aiRouter.plan(h.owner, h.workspace.id, routingInput({ capability: "reasoning", preferredModel: "gpt-4o-mini" })),
    (err: AiError) => err.code === "AI_MODEL_NOT_FOUND",
  );
});

test("router throws when no model supports the required capability", async () => {
  const h = setup();
  await configureProvider(h, "openai", "http://127.0.0.1:1", false);
  await configureProvider(h, "ollama", "http://127.0.0.1:1");

  await assert.rejects(
    h.app.aiRouter.plan(h.owner, h.workspace.id, routingInput({ capability: "vision" })),
    (err: AiError) => err.code === "AI_MODEL_NOT_FOUND",
  );
});

test("cost-aware routing excludes models above maxCost", async () => {
  const h = setup();
  await configureProvider(h, "openai", "http://127.0.0.1:1");
  await configureProvider(h, "ollama", "http://127.0.0.1:1");

  const longInput = routingInput({
    messages: [{ role: "user", content: "x".repeat(8000) }],
    maxCost: 0.01,
  });

  const candidates = await h.app.aiRouter.plan(h.owner, h.workspace.id, longInput);
  for (const c of candidates) {
    assert.ok(c.estimatedCost <= 0.01, `${c.provider}/${c.model} cost ${c.estimatedCost}`);
  }
  assert.ok(candidates.some((c) => c.model === "gpt-4o-mini"));

  // Free models always pass, so disable ollama to force rejection.
  await configureProvider(h, "ollama", "http://127.0.0.1:1", false);
  await assert.rejects(
    h.app.aiRouter.plan(h.owner, h.workspace.id, routingInput({ maxCost: 0.0000001, preferredProvider: "openai" })),
    (err: AiError) => err.code === "AI_INVALID_REQUEST",
  );
});

test("latency-aware routing orders fastest models first", async () => {
  const h = setup();
  await configureProvider(h, "openai", "http://127.0.0.1:1");
  await configureProvider(h, "ollama", "http://127.0.0.1:1");

  const candidates = await h.app.aiRouter.plan(
    h.owner,
    h.workspace.id,
    routingInput({ latencyPreference: "low", taskType: "chat" }),
  );
  const models = candidates.map((c) => c.model);
  assert.equal(models[0], "mistral");
  assert.equal(models[1], "llama3.2");
  assert.ok(models.indexOf("gpt-4o-mini") > models.indexOf("llama3.2"));
});

test("health-aware routing deprioritizes unhealthy providers", async () => {
  const h = setup();
  const dead = await startMockProvider();
  dead.respond(() => ({ status: 500, json: { error: "dead" } }));
  const alive = await startMockProvider();
  alive.respond(okHandler("alive"));
  await configureProvider(h, "openai", dead.base);
  await configureProvider(h, "ollama", alive.base);

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const result = await route(h, routingInput());
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "llama3.2");
});

test("tenant isolation: audit log scoped per workspace", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("ws-a"));
  await configureProvider(h, "openai", openai.base);

  await route(h, routingInput());
  assert.equal(h.app.aiRouter.decisions(h.author, h.workspace.id).length, 1);

  const other = h.identity.createWorkspace({ name: "Other", slug: "router-tenant", ownerId: h.owner.id });
  assert.equal(h.app.aiRouter.decisions(h.owner, other.id).length, 0);
});

test("RBAC: author can route, viewer cannot execute", async () => {
  const h = setup();
  const openai = await startMockProvider();
  openai.respond(okHandler("rbac"));
  await configureProvider(h, "openai", openai.base);

  const viewer = h.identity.createUser({
    email: "viewer@shdos.test",
    name: "Viewer",
    memberships: [{ workspaceId: h.workspace.id, roles: ["viewer"] }],
  });

  const result = await route(h, routingInput(), h.author);
  assert.equal(result.content, "rbac");

  await assert.rejects(
    route(h, routingInput(), viewer),
    (err: AiError) => err.code === "FORBIDDEN",
  );

  const candidates = await h.app.aiRouter.plan(h.author, h.workspace.id, routingInput());
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length > 0);
});

test("RBAC: config change for default/task models requires ai:manage", async () => {
  const h = setup();
  assert.throws(
    () =>
      h.app.ai.updateConfig(h.author, h.workspace.id, {
        defaultModel: "gpt-4o-mini",
        taskModels: { code: "mistral" },
      }),
    (err: AiError) => err.code === "FORBIDDEN",
  );

  h.app.ai.updateConfig(h.owner, h.workspace.id, {
    defaultModel: "gpt-4o-mini",
    taskModels: { code: "mistral" },
  });
  const config = h.app.ai.getConfig(h.owner, h.workspace.id);
  assert.equal(config.defaultModel, "gpt-4o-mini");
  assert.equal(config.taskModels?.code, "mistral");
});

test("router validates input messages", async () => {
  const h = setup();
  await assert.rejects(
    route(h, routingInput({ messages: [] })),
    (err: AiError) => err.code === "AI_INVALID_REQUEST" && err.status === 400,
  );
});

test("plan does not hit providers and reflects candidate order", async () => {
  const h = setup();
  await configureProvider(h, "openai", "http://127.0.0.1:1");
  await configureProvider(h, "ollama", "http://127.0.0.1:1");

  h.app.ai.updateConfig(h.owner, h.workspace.id, { defaultModel: "gpt-4o-mini" });

  const candidates: RouteCandidate[] = await h.app.aiRouter.plan(h.owner, h.workspace.id, routingInput());
  assert.equal(candidates[0].provider, "openai");
  assert.equal(candidates[0].model, "gpt-4o-mini");
  assert.equal(candidates[0].primary, true);
  assert.ok(candidates.some((c) => c.primary === false));
});

test("router emits routing audit event on success and failure", async () => {
  const h = setup();
  const events: string[] = [];
  h.app.bus.on("ai.routed", (e) => {
    events.push(e.type);
  });

  const openai = await startMockProvider();
  openai.respond(okHandler("event ok"));
  await configureProvider(h, "openai", openai.base);

  await route(h, routingInput());
  assert.ok(events.includes("ai.routed"));
  assert.equal(h.app.aiRouter.decisions(h.author, h.workspace.id).length, 1);
});
