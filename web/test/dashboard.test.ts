import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient } from "../lib/api";
import { fetchDashboardData, DASHBOARD_RECENT_LIMIT } from "../lib/dashboard";

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
});

function mockBackend() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, data: unknown) => {
      const payload = JSON.stringify(data);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload);
    };

    if (url.pathname === "/healthz") {
      return send(200, { status: "ok" });
    }

    if (url.pathname === "/api/v1/workspaces" && req.method === "GET") {
      return send(200, [
        { id: "ws_1", name: "Star Hindis", slug: "star-hindis", defaultLocale: "en" },
        { id: "ws_2", name: "Bharat Digital", slug: "bharat-digital", defaultLocale: "hi" },
      ]);
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/content" && req.method === "GET") {
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
      const items = [
        { id: "c_1", title: "Latest news", status: "published", locale: "en", updatedAt: "2026-08-05T10:00:00Z" },
        { id: "c_2", title: "Draft article", status: "draft", locale: "en", updatedAt: "2026-08-04T09:00:00Z" },
      ];
      return send(200, {
        items: items.slice(0, pageSize),
        page: 1,
        pageSize,
        total: items.length,
        totalPages: 1,
      });
    }

    if (url.pathname === "/api/v1/workspaces/ws_1/media" && req.method === "GET") {
      return send(200, [
        { id: "m_1", kind: "image", url: "/media/m_1.png", usage: "featured" },
        { id: "m_2", kind: "file", url: "/media/m_2.pdf", usage: "attachment" },
      ]);
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

test("fetchDashboardData resolves live counts from the backend", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const data = await fetchDashboardData(api, "ws_1");

  assert.equal(data.backendOnline, true);
  assert.equal(data.contentCount, 2);
  assert.equal(data.mediaCount, 2);
  assert.equal(data.workspacesCount, 2);
  assert.equal(data.usersCount, null);
  assert.equal(data.recentActivity?.length, 2);
  assert.equal(data.recentActivity?.[0].title, "Latest news");
});

test("fetchDashboardData falls back to placeholders when endpoints fail", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const data = await fetchDashboardData(api, "ws_missing");

  assert.equal(data.contentCount, null);
  assert.equal(data.mediaCount, null);
  assert.equal(data.recentActivity, null);
  assert.equal(data.workspacesCount, 2);
  assert.equal(data.backendOnline, true);
});

test("recent activity limit is applied via pageSize", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const data = await fetchDashboardData(api, "ws_1");
  assert.ok(data.recentActivity!.length <= DASHBOARD_RECENT_LIMIT);
});

test("listContent and listMedia are exposed on the client", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const content = await api.listContent("ws_1", { page: 1, pageSize: 10 });
  const media = await api.listMedia("ws_1");
  const health = await api.health();

  assert.equal(content.total, 2);
  assert.equal(content.items.length, 2);
  assert.equal(media.length, 2);
  assert.equal(health.status, "ok");
});
