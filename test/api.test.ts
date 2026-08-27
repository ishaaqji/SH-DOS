import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const openServers: Server[] = [];
after(() => {
  for (const server of openServers) {
    server.closeAllConnections?.();
    server.close();
  }
});

interface ApiOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

interface ApiResponse {
  status: number;
  json: any;
}

async function start() {
  const app = createApp();
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(app.server);
  const { port } = app.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const workspace = app.identity.listWorkspaces()[0];

  const request = async (path: string, opts: ApiOptions = {}): Promise<ApiResponse> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await fetch(base + path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };

  return { app, base, request, workspace };
}

test("healthz and openapi are public", async () => {
  const { request } = await start();
  const health = await request("/healthz");
  assert.equal(health.status, 200);
  assert.equal(health.json.status, "ok");

  const spec = await request("/openapi.json");
  assert.equal(spec.status, 200);
  assert.equal(spec.json.openapi, "3.0.3");
  assert.ok(spec.json.paths["/workspaces/{workspaceId}/content"]);
});

test("API requires authentication", async () => {
  const { request } = await start();
  const res = await request("/api/v1/workspaces");
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, "UNAUTHORIZED");
});

test("create, read, update and publish content over the API", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;

  const created = await request(`/api/v1/workspaces/${ws}/content`, {
    method: "POST",
    token: "u_editor",
    body: { type: "article", title: "API Article", body: "Body", seo: { description: "SEO desc" } },
  });
  assert.equal(created.status, 200);
  const id = created.json.id;
  assert.equal(created.json.status, "draft");

  const got = await request(`/api/v1/workspaces/${ws}/content/${id}`, { token: "u_editor" });
  assert.equal(got.status, 200);
  assert.equal(got.json.content.title, "API Article");
  assert.equal(got.json.fallback, false);

  const updated = await request(`/api/v1/workspaces/${ws}/content/${id}`, {
    method: "PATCH",
    token: "u_editor",
    body: { title: "API Article v2", changeSummary: "review" },
  });
  assert.equal(updated.json.title, "API Article v2");

  const versions = await request(`/api/v1/workspaces/${ws}/content/${id}/versions`, { token: "u_editor" });
  assert.equal(versions.json.length, 2);
  assert.equal(versions.json[1].versionNumber, 2);

  await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_editor",
    body: { to: "review" },
  });
  const approved = await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_owner",
    body: { to: "approved" },
  });
  assert.equal(approved.json.status, "approved");
  const published = await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_editor",
    body: { to: "published" },
  });
  assert.equal(published.json.status, "published");
  assert.ok(published.json.publishedAt);
});

test("search endpoint filters by search term and status", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  const mk = (title: string) =>
    request(`/api/v1/workspaces/${ws}/content`, {
      method: "POST",
      token: "u_editor",
      body: { type: "article", title, body: "Lorem ipsum dolor" },
    });
  await mk("Varanasi Ghats");
  await mk("Golden Temple");
  await new Promise((r) => setTimeout(r, 10));

  const list = await request(`/api/v1/workspaces/${ws}/content?search=varanasi`, { token: "u_editor" });
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].title, "Varanasi Ghats");
});

test("pagination and filtering through the API", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  for (let i = 0; i < 5; i++) {
    await request(`/api/v1/workspaces/${ws}/content`, {
      method: "POST",
      token: "u_editor",
      body: { type: i % 2 === 0 ? "article" : "video", title: `Item ${i}` },
    });
  }
  const page = await request(`/api/v1/workspaces/${ws}/content?page=2&pageSize=2&type=article`, { token: "u_editor" });
  assert.equal(page.status, 200);
  assert.equal(page.json.page, 2);
  assert.equal(page.json.pageSize, 2);
  assert.equal(page.json.total, 3);
  assert.ok(page.json.items.every((c: any) => c.type === "article"));
});

test("translations and human review over the API", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  const created = await request(`/api/v1/workspaces/${ws}/content`, {
    method: "POST",
    token: "u_editor",
    body: { type: "news", title: "API News" },
  });
  const id = created.json.id;

  const translation = await request(`/api/v1/workspaces/${ws}/content/${id}/translations`, {
    method: "POST",
    token: "u_editor",
    body: { locale: "hi" },
  });
  assert.equal(translation.status, 200);
  assert.equal(translation.json.status, "auto");

  const list = await request(`/api/v1/workspaces/${ws}/content/${id}/translations`, { token: "u_editor" });
  assert.equal(list.json.length, 1);

  await request(`/api/v1/workspaces/${ws}/translations/${translation.json.id}/review`, {
    method: "POST",
    token: "u_owner",
    body: { action: "mark_review" },
  });
  const reviewed = await request(`/api/v1/workspaces/${ws}/translations/${translation.json.id}/review`, {
    method: "POST",
    token: "u_owner",
    body: { action: "approve" },
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.json.status, "approved");

  const localized = await request(`/api/v1/workspaces/${ws}/content/${id}?locale=hi`, { token: "u_editor" });
  assert.equal(localized.json.viaTranslation, true);
  assert.equal(localized.json.resolvedLocale, "hi");
});

test("locale fallback returns the source content", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  const created = await request(`/api/v1/workspaces/${ws}/content`, {
    method: "POST",
    token: "u_editor",
    body: { type: "page", title: "Untranslated" },
  });
  const resolved = await request(`/api/v1/workspaces/${ws}/content/${created.json.id}?locale=ta`, { token: "u_editor" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.json.fallback, true);
  assert.equal(resolved.json.content.title, "Untranslated");
});

test("author cannot publish over the API", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  const created = await request(`/api/v1/workspaces/${ws}/content`, {
    method: "POST",
    token: "u_author",
    body: { type: "article", title: "Authored" },
  });
  const id = created.json.id;
  const denied = await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_author",
    body: { to: "published" },
  });
  assert.equal(denied.status, 400);
  assert.equal(denied.json.error.code, "VALIDATION_ERROR");

  await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_author",
    body: { to: "review" },
  });
  const forbidden = await request(`/api/v1/workspaces/${ws}/content/${id}/transition`, {
    method: "POST",
    token: "u_author",
    body: { to: "approved" },
  });
  assert.equal(forbidden.status, 403);
});

test("soft delete and restore over the API", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;
  const created = await request(`/api/v1/workspaces/${ws}/content`, {
    method: "POST",
    token: "u_editor",
    body: { type: "page", title: "Gone soon" },
  });
  const id = created.json.id;

  const removed = await request(`/api/v1/workspaces/${ws}/content/${id}`, { method: "DELETE", token: "u_editor" });
  assert.equal(removed.status, 200);

  const gone = await request(`/api/v1/workspaces/${ws}/content/${id}`, { token: "u_editor" });
  assert.equal(gone.status, 404);

  const restored = await request(`/api/v1/workspaces/${ws}/content/${id}/restore`, {
    method: "POST",
    token: "u_editor",
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.json.status, "draft");
});

test("taxonomy and media endpoints", async () => {
  const { request, workspace } = await start();
  const ws = workspace.id;

  const category = await request(`/api/v1/workspaces/${ws}/categories`, {
    method: "POST",
    token: "u_editor",
    body: { name: "Temples" },
  });
  assert.equal(category.status, 200);
  assert.equal(category.json.slug, "temples");

  const tag = await request(`/api/v1/workspaces/${ws}/tags`, {
    method: "POST",
    token: "u_editor",
    body: { name: "pilgrimage" },
  });
  assert.equal(tag.status, 200);

  const media = await request(`/api/v1/workspaces/${ws}/media`, {
    method: "POST",
    token: "u_editor",
    body: { kind: "image", url: "https://cdn.example/pic.jpg", usage: "featured" },
  });
  assert.equal(media.status, 200);

  const langs = await request(`/api/v1/workspaces/${ws}/languages`, { token: "u_editor" });
  assert.equal(langs.status, 200);
  assert.ok(langs.json.length >= 2);
});
