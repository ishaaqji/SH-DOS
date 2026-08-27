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

async function start() {
  const app = createApp();
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(app.server);
  const { port } = app.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const request = async (path: string, opts: { method?: string; token?: string; body?: unknown } = {}) => {
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

  return { app, base, request };
}

test("login with valid credentials returns token, user and workspaces", async () => {
  const { request } = await start();
  const res = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: "owner@shdos.test", password: "password" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.token, "u_owner");
  assert.equal(res.json.user.email, "owner@shdos.test");
  assert.equal(res.json.user.password, undefined);
  assert.ok(Array.isArray(res.json.workspaces));
  assert.equal(res.json.workspaces.length, 1);
  assert.equal(res.json.workspaces[0].slug, "star-hindis");
});

test("login rejects unknown email", async () => {
  const { request } = await start();
  const res = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: "nobody@shdos.test", password: "password" },
  });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, "UNAUTHORIZED");
});

test("login rejects wrong password for password-protected users", async () => {
  const { request } = await start();
  const res = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: "owner@shdos.test", password: "wrong" },
  });
  assert.equal(res.status, 401);
});

test("me returns the current user and workspaces for a valid token", async () => {
  const { request } = await start();
  const res = await request("/api/v1/auth/me", { token: "u_editor" });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.id, "u_editor");
  assert.equal(res.json.user.email, "editor@shdos.test");
  assert.ok(res.json.workspaces.length >= 1);
});

test("me requires authentication", async () => {
  const { request } = await start();
  const res = await request("/api/v1/auth/me");
  assert.equal(res.status, 401);
});

test("workspaces endpoint lists only the workspaces the user belongs to", async () => {
  const { app, request } = await start();
  const solo = app.identity.createUser({
    id: "u_solo",
    email: "solo@shdos.test",
    name: "Solo User",
    password: "password",
  });
  const ws = app.identity.listWorkspaces()[0];
  app.identity.addMembership(solo.id, ws.id, ["viewer"]);

  const res = await request("/api/v1/workspaces", { token: "u_solo" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.map((w: { id: string }) => w.id), [ws.id]);
});

test("workspaces endpoint requires authentication", async () => {
  const { request } = await start();
  const res = await request("/api/v1/workspaces");
  assert.equal(res.status, 401);
});

test("login returns only workspaces the user belongs to", async () => {
  const { app, request } = await start();
  const ws = app.identity.listWorkspaces()[0];
  const res = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: "author@shdos.test", password: "password" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.workspaces.length, 1);
  assert.equal(res.json.workspaces[0].id, ws.id);
});
