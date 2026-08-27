import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import type { IdentityService, User, Workspace } from "../src/identity/identity";
import { AiError } from "../src/ai/errors";

const openServers: Server[] = [];
after(() => {
  for (const server of openServers) {
    server.closeAllConnections?.();
    server.close();
  }
});

interface MockProvider {
  base: string;
  calls: Array<{ url: string; body: any }>;
  respond: (handler: (req: { url?: string; body: any }) => { status: number; json: unknown }) => void;
}

async function startMockProvider(): Promise<MockProvider> {
  const calls: MockProvider["calls"] = [];
  let handler: (req: { url?: string; body: any }) => { status: number; json: unknown } = () => ({
    status: 500,
    json: { error: "unconfigured" },
  });
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
      calls.push({ url: req.url ?? "", body });
      const result = handler({ url: req.url ?? "", body });
      const payload = JSON.stringify(result.json);
      res.writeHead(result.status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(server);
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, calls, respond: (h) => { handler = h; } };
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

function okHandler(content = "dashboard ok") {
  return () => ({
    status: 200,
    json: { id: "cmpl-d", choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  });
}

async function configureOpenai(harness: Harness, base: string): Promise<void> {
  harness.app.ai.updateConfig(harness.owner, harness.workspace.id, {
    providerId: "openai",
    settings: { baseUrl: base, apiKey: "sk-test", enabled: true },
  });
  harness.app.ai.updateConfig(harness.owner, harness.workspace.id, {
    providerId: "ollama",
    settings: { enabled: false },
  });
}

test("dashboard overview aggregates usage, quota, governance and review queue", async () => {
  const h = setup();
  const mock = await startMockProvider();
  mock.respond(okHandler());
  await configureOpenai(h, mock.base);

  // Two successful routed calls -> 2 usage records.
  await h.app.aiRouter.complete(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "Hello one" }],
  });
  await h.app.aiRouter.complete(h.editor, h.workspace.id, {
    messages: [{ role: "user", content: "Hello two" }],
  });

  // PII redaction: flagged but proceeds (review disabled) -> allowed audit + usage record.
  await h.app.aiGovernance.execute(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "contact my email a@b.com" }],
  });

  // Moderation block -> blocked audit, no provider call, no usage record.
  await assert.rejects(
    h.app.aiGovernance.execute(h.author, h.workspace.id, {
      messages: [{ role: "user", content: "I want to kill them" }],
    }),
    (err: AiError) => err.code === "AI_BLOCKED",
  );

  // Human review: create pending review then approve it.
  h.app.aiGovernance.updatePolicy(h.owner, h.workspace.id, { humanReview: { enabled: true } });
  await assert.rejects(
    h.app.aiGovernance.execute(h.author, h.workspace.id, {
      messages: [{ role: "user", content: "please harass my ex" }],
    }),
    (err: AiError) => err.code === "AI_REVIEW_REQUIRED",
  );
  const pending = h.app.aiGovernance.pendingReviews(h.owner, h.workspace.id);
  assert.equal(pending.length, 1);
  h.app.aiGovernance.review(h.owner, h.workspace.id, pending[0].id, "approve", "ok");

  const overview = h.app.aiDashboard.overview(h.editor, h.workspace.id);

  // Usage summary: 3 usage records, all ok.
  assert.equal(overview.usage.summary.requests, 3);
  assert.equal(overview.usage.summary.okRequests, 3);
  assert.equal(overview.usage.summary.failedRequests, 0);
  assert.equal(overview.usage.summary.promptTokens, 30);
  assert.equal(overview.usage.summary.completionTokens, 15);
  assert.equal(overview.usage.summary.totalTokens, 45);
  assert.ok(overview.usage.summary.cost > 0);
  assert.ok(overview.usage.summary.avgLatencyMs !== null && overview.usage.summary.avgLatencyMs >= 0);

  // byProvider and byModel breakdowns.
  assert.equal(overview.usage.byProvider.length, 1);
  assert.equal(overview.usage.byProvider[0].providerId, "openai");
  assert.equal(overview.usage.byProvider[0].requests, 3);
  assert.equal(overview.usage.byProvider[0].tokens, 45);
  assert.equal(overview.usage.byModel.length, 1);
  assert.equal(overview.usage.byModel[0].model, "gpt-4o-mini");

  // byDay contains today's date.
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(overview.usage.byDay.length, 1);
  assert.equal(overview.usage.byDay[0].date, today);
  assert.equal(overview.usage.byDay[0].requests, 3);

  // Quota: consumed matches today's usage, remaining computed from limits.
  const quota = overview.quota;
  assert.equal(quota.limits.requestsPerDay, 1000);
  assert.equal(quota.used.requests, 3);
  assert.equal(quota.used.tokens, 45);
  assert.equal(quota.remaining.requests, 997);
  assert.ok(quota.remaining.tokens !== undefined);
  assert.ok(quota.remaining.cost !== undefined);

  // Governance: blocked (moderation), allowed (redaction), review_required + review_approved.
  assert.equal(overview.governance.counts.blocked, 1);
  assert.equal(overview.governance.counts.allowed, 1);
  assert.equal(overview.governance.counts.review_required, 1);
  assert.equal(overview.governance.counts.review_approved, 1);
  assert.equal(overview.governance.piiRedactions, 1);
  assert.equal(overview.governance.moderation.blocked, 1);
  assert.equal(overview.governance.moderation.flagged, 1);
  assert.equal(overview.governance.moderation.byCategory.violence, 1);
  assert.equal(overview.governance.moderation.byCategory.harassment, 1);

  // Review queue: one review approved, none pending.
  assert.equal(overview.reviews.pending, 0);
  assert.equal(overview.reviews.approved, 1);
  assert.equal(overview.reviews.total, 1);
});

test("dashboard overview date range filtering", async () => {
  const h = setup();
  const mock = await startMockProvider();
  mock.respond(okHandler());
  await configureOpenai(h, mock.base);

  await h.app.aiRouter.complete(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "Hello" }],
  });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const inRange = h.app.aiDashboard.overview(h.owner, h.workspace.id, { from: today, to: today });
  assert.equal(inRange.usage.summary.requests, 1);

  const outOfRange = h.app.aiDashboard.overview(h.owner, h.workspace.id, { from: yesterday, to: yesterday });
  assert.equal(outOfRange.usage.summary.requests, 0);
  assert.equal(outOfRange.usage.byProvider.length, 0);
  assert.equal(outOfRange.governance.counts.allowed, 0);
});

test("dashboard audit lists governance and usage events with filters and pagination", async () => {
  const h = setup();
  const mock = await startMockProvider();
  mock.respond(okHandler());
  await configureOpenai(h, mock.base);

  await h.app.aiRouter.complete(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "Hello" }],
  });
  await h.app.aiGovernance.execute(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "my email is a@b.com" }],
  });
  await assert.rejects(
    h.app.aiGovernance.execute(h.author, h.workspace.id, {
      messages: [{ role: "user", content: "I want to kill them" }],
    }),
    (err: AiError) => err.code === "AI_BLOCKED",
  );

  const all = h.app.aiDashboard.audit(h.owner, h.workspace.id);
  // router.complete -> 1 usage; execute redact -> 1 usage + 1 allowed audit;
  // execute blocked -> 1 blocked audit. Total = 4.
  assert.equal(all.total, 4);

  // All events should be present with sources.
  const sources = new Set(all.items.map((e) => e.source));
  assert.ok(sources.has("usage"));
  assert.ok(sources.has("governance"));
  assert.ok(all.items.every((e) => e.createdAt));

  // Sort newest first.
  const dates = all.items.map((e) => e.createdAt);
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  assert.deepEqual(dates, sorted);

  // Event filter.
  const governanceOnly = h.app.aiDashboard.audit(h.owner, h.workspace.id, { event: "blocked" });
  assert.equal(governanceOnly.total, 1);
  assert.equal(governanceOnly.items[0].event, "blocked");

  const usageOk = h.app.aiDashboard.audit(h.owner, h.workspace.id, { event: "request_ok" });
  assert.equal(usageOk.total, 2);

  // Pagination: pageSize 2 -> 2 pages of 4.
  const page1 = h.app.aiDashboard.audit(h.owner, h.workspace.id, { pageSize: 2, page: 1 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.totalPages, 2);
  const page3 = h.app.aiDashboard.audit(h.owner, h.workspace.id, { pageSize: 2, page: 2 });
  assert.equal(page3.items.length, 2);

  // Date filter excludes everything when range is in the past.
  const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const empty = h.app.aiDashboard.audit(h.owner, h.workspace.id, { from: past, to: past });
  assert.equal(empty.total, 0);
});

test("dashboard RBAC: ai:read required, non-members forbidden", async () => {
  const h = setup();

  const outsider = h.identity.createUser({
    email: "outsider@shdos.test",
    name: "Outsider",
    memberships: [{ workspaceId: "ws_other", roles: ["owner"] }],
  });

  assert.throws(
    () => h.app.aiDashboard.overview(outsider, h.workspace.id),
    (err: AiError) => err.code === "FORBIDDEN",
  );
  assert.throws(
    () => h.app.aiDashboard.audit(outsider, h.workspace.id),
    (err: AiError) => err.code === "FORBIDDEN",
  );

  const viewer = h.identity.createUser({
    email: "viewer@shdos.test",
    name: "Viewer",
    memberships: [{ workspaceId: h.workspace.id, roles: ["viewer"] }],
  });
  assert.ok(h.app.aiDashboard.overview(viewer, h.workspace.id).usage.summary.requests >= 0);
});

test("dashboard tenant isolation across workspaces", async () => {
  const h = setup();
  const mock = await startMockProvider();
  mock.respond(okHandler());
  await configureOpenai(h, mock.base);

  await h.app.aiRouter.complete(h.author, h.workspace.id, {
    messages: [{ role: "user", content: "Hello" }],
  });

  const other = h.identity.createWorkspace({ name: "Other", slug: "dashboard-tenant", ownerId: h.owner.id });
  const otherOverview = h.app.aiDashboard.overview(h.owner, other.id);
  assert.equal(otherOverview.usage.summary.requests, 0);
  assert.equal(otherOverview.usage.byProvider.length, 0);
  assert.equal(otherOverview.usage.byDay.length, 0);
  assert.equal(otherOverview.governance.counts.blocked, 0);
  assert.equal(otherOverview.reviews.total, 0);
  assert.equal(h.app.aiDashboard.audit(h.owner, other.id).total, 0);

  const wsOverview = h.app.aiDashboard.overview(h.owner, h.workspace.id);
  assert.equal(wsOverview.usage.summary.requests, 1);
});

test("dashboard HTTP API endpoints require auth and ai:read", async () => {
  const h = setup();
  await new Promise<void>((resolve) => h.app.server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(h.app.server);
  const { port } = h.app.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const request = async (path: string, token?: string) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { headers });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };

  const ws = h.workspace.id;

  const noAuth = await request(`/api/v1/workspaces/${ws}/ai/dashboard`);
  assert.equal(noAuth.status, 401);

  const outsider = h.identity.createUser({
    email: "api-outsider@shdos.test",
    name: "API Outsider",
    memberships: [{ workspaceId: "ws_other", roles: ["owner"] }],
  });
  const forbidden = await request(`/api/v1/workspaces/${ws}/ai/dashboard`, outsider.id);
  assert.equal(forbidden.status, 403);

  const viewer = h.identity.createUser({
    email: "api-viewer@shdos.test",
    name: "API Viewer",
    memberships: [{ workspaceId: ws, roles: ["viewer"] }],
  });
  const overview = await request(`/api/v1/workspaces/${ws}/ai/dashboard`, viewer.id);
  assert.equal(overview.status, 200);
  assert.ok(overview.json.usage.summary.requests >= 0);
  assert.ok(Array.isArray(overview.json.usage.byProvider));

  const audit = await request(`/api/v1/workspaces/${ws}/ai/dashboard/audit`, viewer.id);
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.json.items));
  assert.ok(typeof audit.json.total === "number");

  const otherWs = h.identity.createWorkspace({ name: "API Other", slug: "api-dashboard-tenant", ownerId: h.owner.id });
  const tenant = await request(`/api/v1/workspaces/${otherWs.id}/ai/dashboard`, h.owner.id);
  assert.equal(tenant.status, 200);
  assert.equal(tenant.json.usage.summary.requests, 0);
});
