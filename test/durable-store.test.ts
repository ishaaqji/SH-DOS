import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/kernel/store";
import { SqliteStore, openDurableDb } from "../src/kernel/sqlite-store";
import { ConflictError, NotFoundError } from "../src/kernel/errors";
import { now } from "../src/kernel/ids";
import { parsePageQuery } from "../src/kernel/pagination";
import { flush } from "./helpers";

interface Fixture extends Record<string, unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  name: string;
  workspaceId: string;
}

function makeRow(id: string, name: string, workspaceId: string, deletedAt?: string | null): Fixture {
  return { id, createdAt: now(), updatedAt: now(), deletedAt, name, workspaceId };
}

test("SqliteStore matches the MemoryStore contract", () => {
  const memory = new MemoryStore<Fixture>();
  const sqlite = new SqliteStore<Fixture>("fixtures", {
    db: openDurableDb(":memory:"),
    workspaceField: "workspaceId",
  });

  const mRow = makeRow("f1", "first", "ws_1");
  const sRow = makeRow("f1", "first", "ws_1");
  memory.insert(mRow);
  sqlite.insert(sRow);

  assert.equal(memory.get("f1")?.name, "first");
  assert.equal(sqlite.get("f1")?.name, "first");
  assert.equal(sqlite.require("f1").id, "f1");

  memory.update("f1", { name: "renamed" });
  sqlite.update("f1", { name: "renamed" });
  assert.equal(memory.get("f1")?.name, "renamed");
  assert.equal(sqlite.get("f1")?.name, "renamed");
  assert.ok((sqlite.get("f1")?.updatedAt ?? "") >= sRow.updatedAt);

  memory.softDelete("f1");
  sqlite.softDelete("f1");
  assert.equal(memory.get("f1"), undefined);
  assert.equal(sqlite.get("f1"), undefined);
  assert.equal(sqlite.list().length, 0);

  memory.restore("f1");
  sqlite.restore("f1");
  assert.equal(memory.get("f1")?.name, "renamed");
  assert.equal(sqlite.get("f1")?.name, "renamed");
  assert.equal(sqlite.list().length, 1);

  assert.deepEqual(
    sqlite.find((r) => r.workspaceId === "ws_1").map((r) => r.id),
    ["f1"],
  );
  assert.throws(() => sqlite.require("missing"), NotFoundError);
});

test("SqliteStore rejects duplicate ids with ConflictError", () => {
  const store = new SqliteStore<Fixture>("dup_fixtures", { db: openDurableDb(":memory:") });
  store.insert(makeRow("d1", "a", "ws_1"));
  assert.throws(() => store.insert(makeRow("d1", "b", "ws_1")), ConflictError);
});

test("data persists across restart via a durable db file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shdos-durable-"));
  const path = join(dir, "db.sqlite");

  const app1 = createApp({ dbPath: path });
  const owner = app1.identity.getUser("u_owner");
  const editor = app1.identity.getUser("u_editor");
  const workspace = app1.identity.listWorkspaces()[0];
  assert.equal(owner.id, "u_owner");
  assert.equal(workspace.name, "Star Hindis");

  const created = app1.content.create(editor, workspace.id, {
    type: "article",
    title: "Persistent Article",
    body: "Survives restarts",
  });
  assert.ok(created.id);
  await flush();
  app1.close();

  const app2 = createApp({ dbPath: path, seed: true });
  const workspace2 = app2.identity.listWorkspaces()[0];
  assert.equal(workspace2.name, "Star Hindis");
  const restored = app2.content.resolve(workspace2.id, created.id).content;
  assert.equal(restored.title, "Persistent Article");
  assert.equal(restored.body, "Survives restarts");
  assert.equal(app2.content.versions(created.id).length, 1);
  assert.equal(app2.content.list(workspace2.id, parsePageQuery({})).total, 1);
  assert.ok(app2.identity.getUser("u_owner"));
  assert.ok(app2.identity.getUser("u_author"));
  app2.close();
});

test("seeding is idempotent across reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "shdos-seed-"));
  const path = join(dir, "db.sqlite");

  const app1 = createApp({ dbPath: path });
  assert.equal(app1.identity.listWorkspaces().length, 1);
  app1.close();

  const app2 = createApp({ dbPath: path });
  assert.equal(app2.identity.listWorkspaces().length, 1);
  assert.equal(app2.identity.findByEmail("owner@shdos.test")?.id, "u_owner");
  assert.equal(app2.identity.findByEmail("editor@shdos.test")?.id, "u_editor");
  assert.equal(app2.identity.findByEmail("author@shdos.test")?.id, "u_author");
  app2.close();
});

test("tenant isolation survives persistence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shdos-tenant-"));
  const path = join(dir, "db.sqlite");

  const app1 = createApp({ dbPath: path });
  const owner = app1.identity.getUser("u_owner");
  const editor = app1.identity.getUser("u_editor");
  const ws1 = app1.identity.listWorkspaces()[0];
  const ws2 = app1.identity.createWorkspace({
    name: "Second Desk",
    slug: "second-desk",
    defaultLocale: "en",
    ownerId: owner.id,
  });
  app1.identity.addMembership(editor.id, ws2.id, ["editor"]);
  app1.content.create(editor, ws1.id, { type: "article", title: "Workspace One Story" });
  app1.content.create(editor, ws2.id, { type: "article", title: "Workspace Two Story" });
  await flush();
  app1.close();

  const app2 = createApp({ dbPath: path });
  const wsA = app2.identity.getWorkspace(ws1.id);
  const wsB = app2.identity.getWorkspace(ws2.id);
  const titlesA = app2.content.list(wsA.id, parsePageQuery({})).items.map((c) => c.title);
  const titlesB = app2.content.list(wsB.id, parsePageQuery({})).items.map((c) => c.title);
  assert.deepEqual(titlesA, ["Workspace One Story"]);
  assert.deepEqual(titlesB, ["Workspace Two Story"]);
  assert.deepEqual(
    app2.content.list(wsA.id, parsePageQuery({ search: "Story" })).items.map((c) => c.title),
    ["Workspace One Story"],
  );
  app2.close();
});

test("search index is rehydrated from durable storage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shdos-search-"));
  const path = join(dir, "db.sqlite");

  const app1 = createApp({ dbPath: path });
  const editor = app1.identity.getUser("u_editor");
  const ws = app1.identity.listWorkspaces()[0];
  app1.content.create(editor, ws.id, { type: "article", title: "Temple of the Lotus", body: "A meditation guide" });
  app1.content.create(editor, ws.id, { type: "news", title: "Monsoon Update", body: "Rainfall in the north" });
  await flush();
  app1.close();

  const app2 = createApp({ dbPath: path });
  const ws2 = app2.identity.listWorkspaces()[0];
  const hit = app2.content.list(ws2.id, parsePageQuery({ search: "lotus" }));
  assert.equal(hit.total, 1);
  assert.equal(hit.items[0].title, "Temple of the Lotus");
  const miss = app2.content.list(ws2.id, parsePageQuery({ search: "rainfall" }));
  assert.equal(miss.items[0].title, "Monsoon Update");
  app2.close();
});
