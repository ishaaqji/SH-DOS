import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient, ApiError } from "../lib/api";
import {
  parseAiDashboardQuery,
  aiDashboardQueryParams,
  fetchAiDashboard,
  eventLabel,
  formatCost,
  formatTokens,
  AI_AUDIT_EVENTS,
  DEFAULT_PAGE_SIZE,
  AI_TASK_TYPES,
  AI_PII_FIELDS,
  MODERATION_CATEGORIES,
  textToTerms,
  termsToText,
  textToAllowlist,
  allowlistToText,
  parseQuotaValue,
  toggleItem,
  taskModelsPatch,
  providerSettingsPatch,
  AI_ASSISTANT_TASKS,
  buildAssistantMessages,
  assistantSystemPrompt,
  assistantErrorState,
  formatUsage,
  type AiDashboardOverview,
  type AiAuditEvent,
  type AiPublicConfig,
  type AiGovernancePolicy,
  type AiReviewRecord,
  type AiTaskType,
  type AiChatResponse,
} from "../lib/ai";

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
});

const reviewRecord: AiReviewRecord = {
  id: "rev_1",
  workspaceId: "ws_1",
  actorId: "u_author",
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-10T10:00:00.000Z",
  summary: { messages: [{ role: "user", content: "Please summarize this." }] },
  findings: [
    { kind: "moderation", category: "violence", severity: "flag", detail: "Input matched violence policy" },
  ],
  status: "pending",
};

function mockBackend() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, data: unknown) => {
      const payload = JSON.stringify(data);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload);
    };

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/dashboard") {
      const overview: AiDashboardOverview = {
        usage: {
          summary: {
            requests: 3,
            okRequests: 3,
            failedRequests: 0,
            promptTokens: 30,
            completionTokens: 15,
            totalTokens: 45,
            cost: 0.0012,
            avgLatencyMs: 120,
          },
          byDay: [{ date: "2026-08-10", requests: 3, tokens: 45, cost: 0.0012 }],
          byProvider: [
            { providerId: "openai", requests: 3, tokens: 45, cost: 0.0012, avgLatencyMs: 120 },
          ],
          byModel: [{ providerId: "openai", model: "gpt-4o-mini", requests: 3, tokens: 45, cost: 0.0012 }],
        },
        quota: {
          limits: { requestsPerDay: 1000, tokensPerDay: 1_000_000, costPerDay: 10 },
          used: { requests: 3, tokens: 45, cost: 0.0012 },
          remaining: { requests: 997, tokens: 999955, cost: 9.9988 },
        },
        governance: {
          counts: {
            blocked: 1,
            flagged: 0,
            redacted: 0,
            review_required: 0,
            review_approved: 0,
            review_rejected: 0,
            allowed: 1,
          },
          piiRedactions: 1,
          moderation: { blocked: 1, flagged: 0, byCategory: { violence: 1 } },
        },
        reviews: { pending: 0, approved: 1, rejected: 0, total: 1 },
      };
      return send(200, overview);
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/dashboard/audit") {
      const events: AiAuditEvent[] = [
        {
          id: "gov_1",
          createdAt: "2026-08-10T10:00:00.000Z",
          source: "governance",
          event: "blocked",
          actorId: "u_author",
          detail: "Input matched violence policy",
        },
        {
          id: "use_1",
          createdAt: "2026-08-10T09:00:00.000Z",
          source: "usage",
          event: "request_ok",
          actorId: "u_author",
          providerId: "openai",
          model: "gpt-4o-mini",
        },
      ];
      const event = url.searchParams.get("event");
      const filtered = event ? events.filter((e) => e.event === event) : events;
      return send(200, {
        items: filtered,
        page: Number(url.searchParams.get("page") ?? "1"),
        pageSize: Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)),
        total: filtered.length,
        totalPages: 1,
      });
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/config") {
      const baseConfig: AiPublicConfig = {
        workspaceId: "ws_1",
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini",
        taskModels: { summarize: "gpt-4o-mini" },
        providers: {
          openai: {
            providerId: "openai",
            label: "OpenAI",
            baseUrl: "https://api.openai.com/v1",
            enabled: true,
            defaultModel: "gpt-4o-mini",
            timeoutMs: 15000,
            retries: 2,
          },
          ollama: {
            providerId: "ollama",
            label: "Ollama",
            baseUrl: "http://localhost:11434",
            enabled: true,
            defaultModel: "llama3.2",
            timeoutMs: 15000,
            retries: 2,
          },
        },
        quota: { requestsPerDay: 1000, tokensPerDay: 1_000_000, costPerDay: 10 },
      };

      if (req.method === "PUT") {
        if (req.headers.authorization?.includes("u_viewer")) {
          return send(403, { error: { code: "FORBIDDEN", message: "ai:manage required" } });
        }
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const input = JSON.parse(raw) as {
            providerId?: string;
            settings?: Partial<AiPublicConfig["providers"][string]>;
            defaultProvider?: string;
            defaultModel?: string;
            taskModels?: Record<string, string>;
            quota?: Partial<AiPublicConfig["quota"]>;
          };
          if (input.providerId && input.settings) {
            baseConfig.providers[input.providerId] = {
              ...baseConfig.providers[input.providerId],
              ...input.settings,
            };
          }
          if (input.defaultProvider) baseConfig.defaultProvider = input.defaultProvider;
          if (input.defaultModel) baseConfig.defaultModel = input.defaultModel;
          if (input.taskModels) {
            for (const [task, model] of Object.entries(input.taskModels)) {
              if (model) baseConfig.taskModels![task as AiTaskType] = model;
            }
          }
          if (input.quota) baseConfig.quota = { ...baseConfig.quota, ...input.quota };
          return send(200, baseConfig);
        });
        return;
      }
      return send(200, baseConfig);
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/governance") {
      const policy: AiGovernancePolicy = {
        enabled: true,
        modelAllowlist: ["gpt-4o-mini"],
        pii: { enabled: true, fields: ["email"], mode: "redact" },
        moderation: { enabled: true, blockCategories: ["violence"], flagCategories: ["spam"] },
        inputSafety: {
          enabled: true,
          blockedTerms: ["secret"],
          maxPromptLength: 2000,
          detectPromptInjection: true,
        },
        outputSafety: { enabled: true, blockedTerms: ["leak"], maxOutputLength: 4000 },
        humanReview: { enabled: true },
      };

      if (req.method === "PUT") {
        if (req.headers.authorization?.includes("u_viewer")) {
          return send(403, { error: { code: "FORBIDDEN", message: "ai:manage required" } });
        }
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const patch = JSON.parse(raw) as Partial<AiGovernancePolicy>;
          const next: AiGovernancePolicy = {
            ...policy,
            ...patch,
            pii: { ...policy.pii, ...patch.pii },
            moderation: { ...policy.moderation, ...patch.moderation },
            inputSafety: { ...policy.inputSafety, ...patch.inputSafety },
            outputSafety: { ...policy.outputSafety, ...patch.outputSafety },
            humanReview: { ...policy.humanReview, ...patch.humanReview },
          };
          return send(200, next);
        });
        return;
      }
      return send(200, policy);
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/governance/reviews/pending") {
      if (req.headers.authorization?.includes("u_viewer")) {
        return send(403, { error: { code: "FORBIDDEN", message: "ai:manage required" } });
      }
      return send(200, [reviewRecord]);
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/governance/reviews/rev_1") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw) as { action: "approve" | "reject"; note?: string };
        const updated: AiReviewRecord = {
          ...reviewRecord,
          status: body.action === "approve" ? "approved" : "rejected",
          reviewedBy: "u_owner",
          reviewedAt: "2026-08-10T12:00:00.000Z",
          note: body.note,
        };
        return send(200, updated);
      });
      return;
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/ai/governance/execute") {
      if (req.headers.authorization?.includes("u_viewer")) {
        return send(403, { error: { code: "FORBIDDEN", message: "ai:use required" } });
      }
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const input = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> };
        const content = input.messages?.[input.messages.length - 1]?.content ?? "";
        if (content.includes("blocked-term")) {
          return send(403, { error: { code: "AI_BLOCKED", message: "Request blocked by governance policy (moderation: violence)" } });
        }
        if (content.includes("flagged-term")) {
          return send(403, { error: { code: "AI_REVIEW_REQUIRED", message: "Request flagged for human review; awaiting approval" } });
        }
        const response: AiChatResponse = {
          id: "resp_1",
          provider: "openai",
          model: "gpt-4o-mini",
          content: "This is the generated response.",
          usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
          cost: 0.0012,
          createdAt: "2026-08-10T12:00:00.000Z",
        };
        return send(200, response);
      });
      return;
    }

    return send(404, { error: { code: "NOT_FOUND", message: "No route" } });
  });

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const { port } = server.address() as AddressInfo;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

test("parseAiDashboardQuery parses filters, dates and pagination", () => {
  const query = parseAiDashboardQuery(
    new URLSearchParams("from=2026-08-01&to=2026-08-10&event=blocked&page=3&pageSize=50"),
  );
  assert.equal(query.from, "2026-08-01");
  assert.equal(query.to, "2026-08-10");
  assert.equal(query.event, "blocked");
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 50);

  const empty = parseAiDashboardQuery(new URLSearchParams(""));
  assert.equal(empty.page, 1);
  assert.equal(empty.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(empty.from, undefined);
  assert.equal(empty.event, undefined);

  const clamped = parseAiDashboardQuery(new URLSearchParams("page=0&pageSize=999"));
  assert.equal(clamped.page, 1);
  assert.equal(clamped.pageSize, 100);
});

test("aiDashboardQueryParams round-trips the query", () => {
  const params = aiDashboardQueryParams({ from: "2026-08-01", event: "blocked", page: 2, pageSize: 50 });
  const query = parseAiDashboardQuery(params);
  assert.equal(query.from, "2026-08-01");
  assert.equal(query.event, "blocked");
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 50);
});

test("aiDashboard client method returns the workspace overview", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const overview = await api.aiDashboard("ws_1", { from: "2026-08-01", to: "2026-08-10" });
  assert.equal(overview.usage.summary.requests, 3);
  assert.equal(overview.usage.summary.totalTokens, 45);
  assert.equal(overview.usage.summary.avgLatencyMs, 120);
  assert.equal(overview.usage.byProvider[0].providerId, "openai");
  assert.equal(overview.quota.remaining.requests, 997);
  assert.equal(overview.governance.counts.blocked, 1);
  assert.equal(overview.governance.moderation.byCategory.violence, 1);
  assert.equal(overview.reviews.approved, 1);
});

test("aiAudit client method filters and returns events", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const all = await api.aiAudit("ws_1");
  assert.equal(all.total, 2);
  assert.equal(all.items.length, 2);

  const blocked = await api.aiAudit("ws_1", { event: "blocked" });
  assert.equal(blocked.total, 1);
  assert.equal(blocked.items[0].event, "blocked");
});

test("fetchAiDashboard resolves overview and audit together", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const data = await fetchAiDashboard(api, "ws_1", {});

  assert.equal(data.overview?.usage.summary.requests, 3);
  assert.equal(data.audit?.items.length, 2);
});

test("fetchAiDashboard falls back to null when endpoints fail", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const data = await fetchAiDashboard(api, "ws_missing", {});

  assert.equal(data.overview, null);
  assert.equal(data.audit, null);
});

test("AI audit event list covers governance and usage events", () => {
  for (const event of [
    "blocked",
    "flagged",
    "redacted",
    "review_required",
    "review_approved",
    "review_rejected",
    "allowed",
    "request_ok",
    "request_failed",
  ]) {
    assert.ok(AI_AUDIT_EVENTS.includes(event), `missing ${event}`);
  }
  assert.equal(eventLabel("review_required"), "review required");
  assert.equal(eventLabel("request_ok"), "request ok");
});

test("cost and token formatting helpers", () => {
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0012), "$0.0012");
  assert.equal(formatCost(1.5), "$1.50");
  assert.equal(formatTokens(1_000_000), "1,000,000");
});

test("getAiConfig returns the workspace provider config", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const config = await api.getAiConfig("ws_1");
  assert.equal(config.defaultProvider, "openai");
  assert.equal(config.defaultModel, "gpt-4o-mini");
  assert.equal(config.providers.openai.enabled, true);
  assert.equal(config.quota.requestsPerDay, 1000);
  assert.ok(!("apiKey" in config.providers.openai));
});

test("updateAiConfig PUTs a partial patch and returns merged config", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const config = await api.updateAiConfig("ws_1", {
    defaultProvider: "ollama",
    quota: { requestsPerDay: 500 },
  });
  assert.equal(config.defaultProvider, "ollama");
  assert.equal(config.quota.requestsPerDay, 500);
  assert.equal(config.quota.tokensPerDay, 1_000_000);

  const provider = await api.updateAiConfig("ws_1", {
    providerId: "openai",
    settings: { enabled: false, baseUrl: "https://api.openai.com/v1" },
  });
  assert.equal(provider.providers.openai.enabled, false);
});

test("getGovernancePolicy returns the workspace policy", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const policy = await api.getGovernancePolicy("ws_1");
  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.modelAllowlist, ["gpt-4o-mini"]);
  assert.deepEqual(policy.moderation.blockCategories, ["violence"]);
  assert.equal(policy.humanReview.enabled, true);
});

test("updateGovernancePolicy PUTs the patch and returns merged policy", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const policy = await api.updateGovernancePolicy("ws_1", {
    modelAllowlist: null,
    pii: { mode: "block" },
    humanReview: { enabled: false },
  });
  assert.equal(policy.pii.mode, "block");
  assert.equal(policy.humanReview.enabled, false);
});

test("listPendingAiReviews returns only the workspace queue", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const reviews = await api.listPendingAiReviews("ws_1");
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, "rev_1");
  assert.equal(reviews[0].status, "pending");
  assert.equal(reviews[0].findings[0].severity, "flag");
});

test("reviewAiReview approves with a note", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const approved = await api.reviewAiReview("ws_1", "rev_1", "approve", "Looks safe");
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewedBy, "u_owner");
  assert.equal(approved.note, "Looks safe");
});

test("reviewAiReview rejects without a note", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const rejected = await api.reviewAiReview("ws_1", "rev_1", "reject");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.note, undefined);
});

test("AI admin endpoints are tenant-scoped to the workspace", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  await assert.rejects(() => api.getAiConfig("ws_other"), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    return true;
  });
  await assert.rejects(() => api.listPendingAiReviews("ws_other"), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    return true;
  });
});

test("AI admin mutations are denied without ai:manage (RBAC backstop)", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_viewer" });

  await assert.rejects(() => api.updateAiConfig("ws_1", { defaultModel: "x" }), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
    return true;
  });
  await assert.rejects(() => api.updateGovernancePolicy("ws_1", { enabled: true }), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
    return true;
  });
  await assert.rejects(() => api.listPendingAiReviews("ws_1"), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
    return true;
  });
});

test("toggleItem adds and removes list entries", () => {
  assert.deepEqual(toggleItem(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleItem(["a", "b"], "a"), ["b"]);
});

test("term text parsing and serialization", () => {
  assert.deepEqual(textToTerms("alpha, beta\n\n gamma "), ["alpha", "beta", "gamma"]);
  assert.deepEqual(textToTerms(""), []);
  assert.equal(termsToText(["alpha", "beta"]), "alpha\nbeta");
  assert.equal(termsToText(undefined), "");
});

test("allowlist parsing clears via null when empty", () => {
  assert.deepEqual(textToAllowlist("gpt-4o-mini\nllama3.2"), ["gpt-4o-mini", "llama3.2"]);
  assert.equal(textToAllowlist("  \n "), null);
  assert.equal(allowlistToText(["gpt-4o-mini", "llama3.2"]), "gpt-4o-mini\nllama3.2");
  assert.equal(allowlistToText(undefined), "");
});

test("quota value parsing treats blank as unlimited", () => {
  assert.equal(parseQuotaValue(""), undefined);
  assert.equal(parseQuotaValue("abc"), undefined);
  assert.equal(parseQuotaValue("0"), undefined);
  assert.equal(parseQuotaValue("500"), 500);
});

test("taskModelsPatch keeps only non-empty models", () => {
  const patch = taskModelsPatch({ chat: "gpt-4o-mini", summarize: "", translate: "nmt" });
  assert.deepEqual(patch.taskModels, { chat: "gpt-4o-mini", translate: "nmt" });
  assert.equal(patch.providerId, undefined);
});

test("providerSettingsPatch targets a single provider without secrets", () => {
  const patch = providerSettingsPatch(
    {
      providerId: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      enabled: true,
      timeoutMs: 15000,
      retries: 2,
    },
    { enabled: false, baseUrl: "https://api.openai.com/v1" },
  );
  assert.equal(patch.providerId, "openai");
  assert.deepEqual(patch.settings, { enabled: false, baseUrl: "https://api.openai.com/v1" });
  assert.ok(!("apiKey" in (patch.settings ?? {})));
});

test("AI task, PII and moderation option lists are complete", () => {
  assert.deepEqual(AI_TASK_TYPES, ["chat", "summarize", "classify", "extract", "translate", "code"]);
  assert.ok(AI_PII_FIELDS.includes("email"));
  assert.ok(AI_PII_FIELDS.includes("ssn"));
  assert.ok(MODERATION_CATEGORIES.includes("violence"));
  assert.ok(MODERATION_CATEGORIES.includes("hate"));
});

test("canManageAi gates manage actions to owner/admin/editor", async () => {
  const { canManageAi } = await import("../lib/permissions");
  assert.equal(canManageAi(["owner"]), true);
  assert.equal(canManageAi(["admin"]), true);
  assert.equal(canManageAi(["editor"]), true);
  assert.equal(canManageAi(["author"]), false);
  assert.equal(canManageAi(["viewer"]), false);
  assert.equal(canManageAi(["reviewer"]), false);
  assert.equal(canManageAi([]), false);
});

test("canUseAi gates AI use to owner/admin/editor/author", async () => {
  const { canUseAi } = await import("../lib/permissions");
  assert.equal(canUseAi(["owner"]), true);
  assert.equal(canUseAi(["admin"]), true);
  assert.equal(canUseAi(["editor"]), true);
  assert.equal(canUseAi(["author"]), true);
  assert.equal(canUseAi(["viewer"]), false);
  assert.equal(canUseAi(["reviewer"]), false);
  assert.equal(canUseAi([]), false);
});

test("governedAiExecute runs through the governed endpoint and returns usage", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_author" });

  const response = await api.governedAiExecute("ws_1", {
    taskType: "summarize",
    messages: [{ role: "user", content: "Summarize this paragraph." }],
  });
  assert.equal(response.id, "resp_1");
  assert.equal(response.model, "gpt-4o-mini");
  assert.equal(response.content, "This is the generated response.");
  assert.equal(response.usage.totalTokens, 20);
  assert.equal(response.cost, 0.0012);
});

test("governedAiExecute surfaces blocked requests", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_author" });

  await assert.rejects(
    () => api.governedAiExecute("ws_1", { messages: [{ role: "user", content: "contains blocked-term" }] }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "AI_BLOCKED");
      return true;
    },
  );
});

test("governedAiExecute surfaces review-required requests", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_author" });

  await assert.rejects(
    () => api.governedAiExecute("ws_1", { messages: [{ role: "user", content: "contains flagged-term" }] }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "AI_REVIEW_REQUIRED");
      return true;
    },
  );
});

test("governedAiExecute denies users without ai:use (RBAC backstop)", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_viewer" });

  await assert.rejects(
    () => api.governedAiExecute("ws_1", { messages: [{ role: "user", content: "hello" }] }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "FORBIDDEN");
      return true;
    },
  );
});

test("governedAiExecute is tenant-scoped to the workspace", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  await assert.rejects(
    () => api.governedAiExecute("ws_other", { messages: [{ role: "user", content: "hello" }] }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test("assistant task templates cover chat and the four requested tasks", () => {
  assert.deepEqual(
    AI_ASSISTANT_TASKS.map((t) => t.value),
    ["chat", "summarize", "translate", "extract", "code"],
  );
  assert.equal(assistantSystemPrompt("chat"), undefined);
  assert.ok(assistantSystemPrompt("summarize")?.includes("Summarize"));
  assert.ok(assistantSystemPrompt("translate")?.includes("Translate"));
  assert.ok(assistantSystemPrompt("extract")?.includes("Extract"));
  assert.ok(assistantSystemPrompt("code")?.includes("code"));
});

test("buildAssistantMessages prepends a system prompt for templates", () => {
  const messages = buildAssistantMessages("summarize", "  A long text to summarize.  ");
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.equal(messages[1].content, "A long text to summarize.");

  const chat = buildAssistantMessages("chat", "Hello");
  assert.equal(chat.length, 1);
  assert.equal(chat[0].role, "user");

  const blank = buildAssistantMessages("chat", "   ");
  assert.equal(blank.length, 0);
});

test("assistantErrorState maps governance outcomes to safe copy", () => {
  const blocked = assistantErrorState("AI_BLOCKED");
  assert.equal(blocked.tone, "danger");
  assert.ok(blocked.title.toLowerCase().includes("blocked"));

  const review = assistantErrorState("AI_REVIEW_REQUIRED");
  assert.equal(review.tone, "warning");
  assert.ok(review.title.toLowerCase().includes("review"));

  const quota = assistantErrorState("AI_QUOTA_EXCEEDED");
  assert.equal(quota.tone, "warning");

  const unknown = assistantErrorState("AI_PROVIDER_UNAVAILABLE");
  assert.equal(unknown.tone, "danger");
  assert.equal(assistantErrorState(null).tone, "danger");

  const cancelled = assistantErrorState("CANCELLED");
  assert.equal(cancelled.tone, "neutral");
  assert.ok(cancelled.title.toLowerCase().includes("cancel"));
});

test("formatUsage summarises token consumption", () => {
  assert.equal(formatUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }), "15 tokens (10 in / 5 out)");
});
