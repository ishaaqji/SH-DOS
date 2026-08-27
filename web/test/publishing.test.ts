import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient, ApiError } from "../lib/api";
import {
  WORKFLOW_STEPS,
  QUEUE_TABS,
  TRANSITION_LABELS,
  transitionLabel,
  canRunAction,
  canSubmitForReview,
  canReview,
  canPublish,
  canSchedule,
  nextStatusFor,
  isScheduled,
  type WorkflowPermission,
} from "../lib/publishing";
import type { ContentVersion, WorkflowAudit } from "../lib/types";

function permissions(partial: Partial<WorkflowPermission> = {}): WorkflowPermission {
  return { canSubmitForReview: false, canReview: false, canPublish: false, canSchedule: false, ...partial };
}

test("WORKFLOW_STEPS follows draft → review → approved → published", () => {
  assert.deepEqual(WORKFLOW_STEPS, ["draft", "review", "approved", "published"]);
});

test("QUEUE_TABS covers all workflow statuses plus the all view", () => {
  const values = QUEUE_TABS.map((tab) => tab.value);
  assert.deepEqual(values, ["all", "draft", "review", "approved", "published"]);
});

test("transitionLabel maps known labels and falls back to spaced label", () => {
  assert.equal(transitionLabel("submit_for_review"), "Submit for review");
  assert.equal(transitionLabel("approve"), "Approve");
  assert.equal(transitionLabel("request_changes"), "Request changes");
  assert.equal(transitionLabel("custom_label"), "custom label");
});

test("TRANSITION_LABELS covers every allowed transition", () => {
  for (const label of ["submit_for_review", "approve", "request_changes", "publish", "unapprove", "unpublish", "archive", "restore"]) {
    assert.ok(TRANSITION_LABELS[label], `missing label for ${label}`);
  }
});

test("role-based permission helpers reflect backend ROLE_PERMISSIONS", () => {
  assert.equal(canSubmitForReview(["owner"]), true);
  assert.equal(canSubmitForReview(["admin"]), true);
  assert.equal(canSubmitForReview(["editor"]), true);
  assert.equal(canSubmitForReview(["author"]), true);
  assert.equal(canSubmitForReview(["reviewer"]), false);
  assert.equal(canSubmitForReview(["viewer"]), false);

  assert.equal(canReview(["reviewer"]), true);
  assert.equal(canReview(["editor"]), true);
  assert.equal(canReview(["author"]), false);
  assert.equal(canReview(["viewer"]), false);

  assert.equal(canPublish(["editor"]), true);
  assert.equal(canPublish(["owner"]), true);
  assert.equal(canPublish(["author"]), false);
  assert.equal(canPublish(["reviewer"]), false);

  assert.equal(canSchedule(["author"]), true);
  assert.equal(canSchedule(["reviewer"]), false);
});

test("canRunAction gates review actions behind canReview", () => {
  assert.equal(canRunAction(permissions({ canReview: true }), "approve"), true);
  assert.equal(canRunAction(permissions({ canReview: false }), "approve"), false);
  assert.equal(canRunAction(permissions({ canReview: true }), "publish"), false);
});

test("canRunAction gates publish and archive behind canPublish", () => {
  assert.equal(canRunAction(permissions({ canPublish: true }), "publish"), true);
  assert.equal(canRunAction(permissions({ canPublish: true }), "archive"), true);
  assert.equal(canRunAction(permissions({ canPublish: false }), "publish"), false);
  assert.equal(canRunAction(permissions({ canPublish: true }), "approve"), false);
});

test("canRunAction gates manage transitions behind canSubmitForReview", () => {
  for (const label of ["submit_for_review", "request_changes", "unapprove", "unpublish", "restore"]) {
    assert.equal(canRunAction(permissions({ canSubmitForReview: true }), label), true, `${label} should be allowed`);
    assert.equal(canRunAction(permissions({ canSubmitForReview: false }), label), false, `${label} should be denied`);
  }
});

test("canRunAction returns false for unknown labels", () => {
  assert.equal(canRunAction(permissions({ canSubmitForReview: true, canReview: true, canPublish: true }), "bogus"), false);
});

test("nextStatusFor returns the target status", () => {
  assert.equal(nextStatusFor({ from: "draft", to: "review", action: "update", label: "submit_for_review" }), "review");
});

test("isScheduled reports whether a schedule is set", () => {
  assert.equal(isScheduled({ status: "draft" }), false);
  assert.equal(isScheduled({ status: "draft", scheduledAt: "2026-08-09T12:00:00Z" }), true);
});

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
});

function version(n: number, overrides: Partial<ContentVersion> = {}): ContentVersion {
  return {
    id: `ver_${n}`,
    contentId: "c_1",
    versionNumber: n,
    title: `Version ${n}`,
    slug: "post",
    body: "",
    status: n % 2 === 0 ? "approved" : "draft",
    changeSummary: `change ${n}`,
    changedBy: "u_editor",
    createdAt: `2026-08-0${n}T10:00:00Z`,
    updatedAt: `2026-08-0${n}T10:00:00Z`,
    ...overrides,
  };
}

function auditEntry(i: number, overrides: Partial<WorkflowAudit> = {}): WorkflowAudit {
  return {
    id: `aud_${i}`,
    workspaceId: "ws_1",
    contentId: "c_1",
    from: i > 0 ? "draft" : undefined,
    to: i > 0 ? "approved" : "draft",
    actorId: "u_editor",
    note: i > 0 ? "Looks good" : undefined,
    createdAt: `2026-08-0${i + 1}T09:00:00Z`,
    updatedAt: `2026-08-0${i + 1}T09:00:00Z`,
    ...overrides,
  };
}

function mockBackend() {
  const store: Record<string, ContentVersion[]> = { c_1: [version(1), version(2)] };
  const auditStore: Record<string, WorkflowAudit[]> = { c_1: [auditEntry(0), auditEntry(1)] };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as Record<string, unknown>) : {};
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };

      if (url.pathname === "/api/v1/workspaces/ws_1/content/c_1/transition" && req.method === "POST") {
        return send(200, {
          id: "c_1",
          workspaceId: "ws_1",
          type: "article",
          title: "Post",
          slug: "post",
          body: "",
          status: body.to,
          categoryIds: [],
          tagIds: [],
          attachmentIds: [],
          locale: "en",
          seo: {},
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-02T00:00:00Z",
        });
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/content/c_1/schedule" && req.method === "POST") {
        return send(200, {
          id: "c_1",
          workspaceId: "ws_1",
          type: "article",
          title: "Post",
          slug: "post",
          body: "",
          status: "approved",
          scheduledAt: body.scheduledAt,
          categoryIds: [],
          tagIds: [],
          attachmentIds: [],
          locale: "en",
          seo: {},
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-02T00:00:00Z",
        });
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/content/c_1/versions" && req.method === "GET") {
        return send(200, store.c_1);
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/content/c_1/audit" && req.method === "GET") {
        return send(200, auditStore.c_1);
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/content/c_1/transitions" && req.method === "GET") {
        return send(200, [
          { from: "draft", to: "review", action: "update", label: "submit_for_review" },
          { from: "review", to: "approved", action: "review", label: "approve" },
        ]);
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/scheduler/run" && req.method === "POST") {
        return send(200, [
          { id: "c_sched", workspaceId: "ws_1", type: "article", title: "Scheduled", slug: "scheduled", body: "", status: "published", categoryIds: [], tagIds: [], attachmentIds: [], locale: "en", seo: {}, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
        ]);
      }

      return send(404, { error: { code: "NOT_FOUND", message: "No route" } });
    });
  });

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const { port } = server.address() as AddressInfo;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

test("api client transitions content status", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const content = await api.transitionContent("ws_1", "c_1", "review");
  assert.equal(content.status, "review");
  assert.equal(content.id, "c_1");
});

test("api client schedules content publishing", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const when = "2026-08-10T12:00:00Z";
  const content = await api.scheduleContent("ws_1", "c_1", when);
  assert.equal(content.scheduledAt, when);
});

test("api client loads versions and audit history", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const versions = await api.contentVersions("ws_1", "c_1");
  assert.equal(versions.length, 2);
  assert.equal(versions[0].versionNumber, 1);
  assert.equal(versions[1].versionNumber, 2);

  const audit = await api.contentAudit("ws_1", "c_1");
  assert.equal(audit.length, 2);
  assert.equal(audit[0].to, "draft");
  assert.equal(audit[1].to, "approved");
});

test("api client lists allowed transitions", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const transitions = await api.allowedTransitions("ws_1", "c_1");
  assert.equal(transitions.length, 2);
  assert.deepEqual(transitions.map((t) => t.label), ["submit_for_review", "approve"]);
});

test("api client runs the scheduler", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const published = await api.runScheduler("ws_1");
  assert.equal(published.length, 1);
  assert.equal(published[0].status, "published");
});

test("api client throws ApiError on unknown route", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  await assert.rejects(() => api.scheduleContent("ws_1", "c_missing", "2026-08-10T12:00:00Z"), ApiError);
});
