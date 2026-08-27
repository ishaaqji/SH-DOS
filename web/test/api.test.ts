import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient, ApiError } from "../lib/api";

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
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      const send = (status: number, data: unknown) => {
        const payload = JSON.stringify(data);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload);
      };

      if (url.pathname === "/api/v1/auth/login" && req.method === "POST") {
        if (body.email === "owner@shdos.test" && body.password === "password") {
          return send(200, {
            token: "u_owner",
            user: { id: "u_owner", email: "owner@shdos.test", name: "Platform Owner" },
            workspaces: [{ id: "ws_1", name: "Star Hindis", slug: "star-hindis" }],
          });
        }
        return send(401, { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      }

      if (url.pathname === "/api/v1/auth/me" && req.method === "GET") {
        const auth = req.headers.authorization ?? "";
        if (auth === "Bearer u_editor") {
          return send(200, {
            user: { id: "u_editor", email: "editor@shdos.test", name: "Rohan Editor" },
            workspaces: [{ id: "ws_1", name: "Star Hindis", slug: "star-hindis" }],
          });
        }
        return send(401, { error: { code: "UNAUTHORIZED", message: "Invalid token" } });
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

test("login resolves token, user and workspaces", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl });
  const result = await api.login("owner@shdos.test", "password");
  assert.equal(result.token, "u_owner");
  assert.equal(result.user.email, "owner@shdos.test");
  assert.equal(result.workspaces.length, 1);
  assert.equal(result.workspaces[0].slug, "star-hindis");
});

test("login failure throws ApiError with backend code", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl });
  const error = await api.login("owner@shdos.test", "wrong").then(
    () => null,
    (err) => err,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 401);
  assert.equal(error.code, "UNAUTHORIZED");
});

test("me uses the token from getToken", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_editor" });
  const me = await api.me();
  assert.equal(me.user.id, "u_editor");
  assert.equal(me.user.email, "editor@shdos.test");
});

test("me without token is rejected", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl });
  const error = await api.me().then(
    () => null,
    (err) => err,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 401);
});

function mockContentBackend() {
  let contents: Record<string, Record<string, unknown>> = {};
  let nextId = 1;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      const send = (status: number, data: unknown) => {
        const payload = JSON.stringify(data);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload);
      };

      const base = "/api/v1/workspaces/ws_1/content";
      if (url.pathname === base && req.method === "GET") {
        const items = Object.values(contents);
        return send(200, {
          items,
          page: 1,
          pageSize: 20,
          total: items.length,
          totalPages: Math.max(1, Math.ceil(items.length / 20)),
        });
      }
      if (url.pathname === base && req.method === "POST") {
        const content = {
          id: `con_${nextId++}`,
          workspaceId: "ws_1",
          type: body.type,
          title: body.title,
          slug: body.slug ?? "auto-slug",
          body: body.body ?? "",
          status: "draft",
          categoryIds: body.categoryIds ?? [],
          tagIds: body.tagIds ?? [],
          locale: body.locale ?? "en",
          seo: {},
          createdAt: "2026-08-05T10:00:00Z",
          updatedAt: "2026-08-05T10:00:00Z",
        };
        contents[content.id] = content;
        return send(200, content);
      }

      const itemMatch = url.pathname.match(new RegExp(`^${base}/([^/]+)$`));
      if (itemMatch && req.method === "GET") {
        const content = contents[itemMatch[1]];
        if (!content) return send(404, { error: { code: "NOT_FOUND", message: "Missing" } });
        return send(200, { content });
      }
      if (itemMatch && req.method === "PATCH") {
        const existing = contents[itemMatch[1]];
        if (!existing) return send(404, { error: { code: "NOT_FOUND", message: "Missing" } });
        const updated = { ...existing, ...body, updatedAt: "2026-08-06T10:00:00Z" };
        contents[itemMatch[1]] = updated;
        return send(200, updated);
      }
      if (itemMatch && req.method === "DELETE") {
        const content = contents[itemMatch[1]];
        if (!content) return send(404, { error: { code: "NOT_FOUND", message: "Missing" } });
        delete contents[itemMatch[1]];
        return send(200, { ...content, deletedAt: "2026-08-07T10:00:00Z" });
      }

      const transitionMatch = url.pathname.match(
        new RegExp(`^${base}/([^/]+)/transition$`),
      );
      if (transitionMatch && req.method === "POST") {
        const existing = contents[transitionMatch[1]];
        if (!existing) return send(404, { error: { code: "NOT_FOUND", message: "Missing" } });
        const updated = { ...existing, status: body.to, updatedAt: "2026-08-06T10:00:00Z" };
        contents[transitionMatch[1]] = updated;
        return send(200, updated);
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/categories" && req.method === "GET") {
        return send(200, [
          { id: "cat_1", workspaceId: "ws_1", name: "Politics", slug: "politics" },
        ]);
      }
      if (url.pathname === "/api/v1/workspaces/ws_1/tags" && req.method === "GET") {
        return send(200, [{ id: "tag_1", workspaceId: "ws_1", name: "Breaking", slug: "breaking" }]);
      }
      if (url.pathname === "/api/v1/workspaces/ws_1/authors" && req.method === "GET") {
        return send(200, [{ id: "aut_1", workspaceId: "ws_1", name: "Rohan Editor" }]);
      }
      if (url.pathname === "/api/v1/workspaces/ws_1/languages" && req.method === "GET") {
        return send(200, [{ id: "lang_1", code: "en", name: "English", nativeName: "English", locale: "en", isDefault: true, isActive: true }]);
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

test("content CRUD round-trips through the client", async () => {
  const { baseUrl } = await mockContentBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const created = await api.createContent("ws_1", {
    type: "article",
    title: "Hello",
    categoryIds: ["cat_1"],
    tagIds: ["tag_1"],
  });
  assert.equal(created.id, "con_1");
  assert.equal(created.status, "draft");
  assert.deepEqual(created.categoryIds, ["cat_1"]);

  const resolved = await api.getContent("ws_1", created.id);
  assert.equal(resolved.content.title, "Hello");

  const updated = await api.updateContent("ws_1", created.id, { title: "Hello v2" });
  assert.equal(updated.title, "Hello v2");

  const transitioned = await api.transitionContent("ws_1", created.id, "published");
  assert.equal(transitioned.status, "published");

  const list = await api.listContent("ws_1", { page: 1, pageSize: 20 });
  assert.equal(list.total, 1);

  const deleted = await api.deleteContent("ws_1", created.id);
  assert.ok(deleted.deletedAt);
  const afterDelete = await api.listContent("ws_1");
  assert.equal(afterDelete.total, 0);
});

test("content client exposes taxonomy, authors and languages", async () => {
  const { baseUrl } = await mockContentBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const categories = await api.listCategories("ws_1");
  const tags = await api.listTags("ws_1");
  const authors = await api.listAuthors("ws_1");
  const languages = await api.listLanguages("ws_1");

  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, "Politics");
  assert.equal(tags.length, 1);
  assert.equal(authors[0].name, "Rohan Editor");
  assert.equal(languages[0].code, "en");
});

test("content methods surface backend errors", async () => {
  const { baseUrl } = await mockContentBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });

  const error = await api.getContent("ws_1", "con_missing").then(
    () => null,
    (err) => err,
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 404);
  assert.equal(error.code, "NOT_FOUND");
});
