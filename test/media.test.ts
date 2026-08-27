import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { setup } from "./helpers";
import { MemoryStorage, DiskStorage } from "../src/media/storage";
import { detectMime, validateUpload, MAX_UPLOAD_BYTES } from "../src/media/validation";
import { imageSize } from "../src/media/metadata";
import { MemoryStore } from "../src/kernel/store";
import { IdentityService } from "../src/identity/identity";
import { MediaService } from "../src/media/service";
import { ValidationError, NotFoundError } from "../src/kernel/errors";
import type { MediaReference } from "../src/content/types";

const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de" +
    "0000000c4944415408d763f8cfc0000000030001000000003464538d0000000049454e44ae426082",
  "hex",
);

function makeJpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(16, 0);
  app0.write("JFIF", 0, "latin1");
  const dqt = Buffer.alloc(67, 0);
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    app0,
    Buffer.from([0xff, 0xdb, 0x00, 0x43]),
    dqt,
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
}

const openServers: Server[] = [];
after(() => {
  for (const server of openServers) {
    server.closeAllConnections?.();
    server.close();
  }
});

async function startApi() {
  const app = createApp();
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", () => resolve()));
  openServers.push(app.server);
  const { port } = app.server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const workspace = app.identity.listWorkspaces()[0];
  return { app, base, workspace };
}

test("storage abstraction roundtrips objects", async () => {
  const storage = new MemoryStorage();
  await storage.put("ws/a.png", Buffer.from("x"));
  assert.equal((await storage.get("ws/a.png"))?.toString(), "x");
  assert.equal(storage.url("ws/a.png"), "/media/ws/a.png");
  await storage.delete("ws/a.png");
  assert.equal(await storage.get("ws/a.png"), undefined);
});

test("disk storage persists to the filesystem", async () => {
  const dir = `/tmp/opencode/m3-media-${Date.now()}`;
  const storage = new DiskStorage(dir);
  await storage.put("k.bin", Buffer.from("data"));
  assert.equal((await storage.get("k.bin"))?.toString(), "data");
  assert.equal(storage.url("k.bin"), "/media/k.bin");
  await storage.delete("k.bin");
  assert.equal(await storage.get("k.bin"), undefined);
});

test("file validation detects mime types", () => {
  assert.equal(detectMime(PNG_1x1), "image/png");
  assert.equal(detectMime(makeJpeg(80, 44)), "image/jpeg");
  assert.equal(detectMime(Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.from("x")])), "application/pdf");
  const { kind, mimeType } = validateUpload(PNG_1x1);
  assert.equal(kind, "image");
  assert.equal(mimeType, "image/png");
});

test("file validation rejects empty, unknown and oversized files", () => {
  assert.throws(() => validateUpload(Buffer.alloc(0)), ValidationError);
  assert.throws(() => validateUpload(Buffer.from("plain text content")), ValidationError);
  assert.throws(() => validateUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), /exceeds/);
});

test("image metadata extracts dimensions", () => {
  assert.deepEqual(imageSize(PNG_1x1), { width: 1, height: 1 });
  assert.deepEqual(imageSize(makeJpeg(80, 44)), { width: 80, height: 44 });
});

test("upload creates a media record with metadata and can be read back", async () => {
  const { app, editor, workspace } = setup();
  const media = await app.media.upload(editor, workspace.id, PNG_1x1, {
    filename: "dot.png",
    alt: "A dot",
    usage: "featured",
  });
  assert.equal(media.kind, "image");
  assert.equal(media.mimeType, "image/png");
  assert.equal(media.width, 1);
  assert.equal(media.height, 1);
  assert.equal(media.sizeBytes, PNG_1x1.length);
  assert.ok(media.url.startsWith("/media/"));
  assert.equal(app.media.get(workspace.id, media.id).id, media.id);
  assert.equal(app.media.list(workspace.id).length, 1);
});

test("upload rejects unsupported files", async () => {
  const { app, editor, workspace } = setup();
  await assert.rejects(
    app.media.upload(editor, workspace.id, Buffer.from("definitely not a file")),
    ValidationError,
  );
});

test("delete removes the media record and the stored blob", async () => {
  const storage = new MemoryStorage();
  const identity = new IdentityService();
  const mediaStore = new MemoryStore<MediaReference>();
  const service = new MediaService({ storage, media: mediaStore, identity });
  const user = identity.createUser({
    email: "u@t.test",
    name: "U",
    memberships: [{ workspaceId: "*", roles: ["owner"] }],
  });
  identity.createWorkspace({ name: "W", ownerId: user.id });
  const workspace = identity.listWorkspaces()[0].id;

  const media = await service.upload(user, workspace, PNG_1x1, {});
  const key = media.url.replace(/^\/media\//, "");
  assert.ok(await storage.get(key));

  await service.delete(user, workspace, media.id);
  assert.equal(await storage.get(key), undefined);
  assert.throws(() => service.get(workspace, media.id), NotFoundError);
});

test("uploaded media can be attached to content", async () => {
  const { app, editor, workspace } = setup();
  const featured = await app.media.upload(editor, workspace.id, PNG_1x1, { usage: "featured" });
  const content = app.content.create(editor, workspace.id, { type: "article", title: "With Image" });
  const updated = app.content.update(editor, workspace.id, content.id, {
    featuredImageId: featured.id,
    attachmentIds: [featured.id],
  });
  assert.equal(updated.featuredImageId, featured.id);
  assert.deepEqual(updated.attachmentIds, [featured.id]);
});

test("upload API accepts raw bytes and returns the media record", async () => {
  const { base, workspace } = await startApi();
  const ws = workspace.id;
  const res = await fetch(`${base}/api/v1/workspaces/${ws}/media/upload?filename=dot.png&usage=featured&alt=A%20dot`, {
    method: "POST",
    headers: { authorization: "Bearer u_editor", "content-type": "application/octet-stream" },
    body: PNG_1x1,
  });
  assert.equal(res.status, 200);
  const media = await res.json();
  assert.equal(media.kind, "image");
  assert.equal(media.mimeType, "image/png");
  assert.equal(media.width, 1);
  assert.ok(media.id);

  const list = await fetch(`${base}/api/v1/workspaces/${ws}/media`, {
    headers: { authorization: "Bearer u_editor" },
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).length, 1);

  const del = await fetch(`${base}/api/v1/workspaces/${ws}/media/${media.id}`, {
    method: "DELETE",
    headers: { authorization: "Bearer u_editor" },
  });
  assert.equal(del.status, 200);

  const gone = await fetch(`${base}/api/v1/workspaces/${ws}/media/${media.id}`, {
    headers: { authorization: "Bearer u_editor" },
  });
  assert.equal(gone.status, 404);
});

test("upload API rejects invalid files", async () => {
  const { base, workspace } = await startApi();
  const ws = workspace.id;
  const res = await fetch(`${base}/api/v1/workspaces/${ws}/media/upload`, {
    method: "POST",
    headers: { authorization: "Bearer u_editor" },
    body: Buffer.from("not a file"),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "VALIDATION_ERROR");
});

test("update renames alt text and changes usage", async () => {
  const { app, editor, workspace } = setup();
  const media = await app.media.upload(editor, workspace.id, PNG_1x1, { alt: "Old alt", usage: "attachment" });
  const updated = app.media.update(editor, workspace.id, media.id, {
    alt: "New alt",
    usage: "featured",
  });
  assert.equal(updated.alt, "New alt");
  assert.equal(updated.usage, "featured");
  assert.equal(updated.id, media.id);
  assert.equal(app.media.get(workspace.id, media.id).alt, "New alt");
});

test("replace swaps stored bytes and updates metadata", async () => {
  const storage = new MemoryStorage();
  const identity = new IdentityService();
  const mediaStore = new MemoryStore<MediaReference>();
  const service = new MediaService({ storage, media: mediaStore, identity });
  const user = identity.createUser({
    email: "u@t.test",
    name: "U",
    memberships: [{ workspaceId: "*", roles: ["owner"] }],
  });
  identity.createWorkspace({ name: "W", ownerId: user.id });
  const workspace = identity.listWorkspaces()[0].id;

  const media = await service.upload(user, workspace, PNG_1x1, { alt: "Before" });
  const jpeg = makeJpeg(320, 180);
  const replaced = await service.replace(user, workspace, media.id, jpeg, { alt: "After" });
  assert.equal(replaced.id, media.id);
  assert.equal(replaced.kind, "image");
  assert.equal(replaced.mimeType, "image/jpeg");
  assert.equal(replaced.width, 320);
  assert.equal(replaced.height, 180);
  assert.equal(replaced.sizeBytes, jpeg.length);
  assert.equal(replaced.alt, "After");
  assert.equal(replaced.url, media.url);

  const key = replaced.url.replace(/^\/media\//, "");
  const stored = await storage.get(key);
  assert.ok(stored);
  assert.deepEqual(stored, jpeg);
});

test("update API patches metadata and replace API swaps bytes", async () => {
  const { base, workspace } = await startApi();
  const ws = workspace.id;
  const headers = { authorization: "Bearer u_editor", "content-type": "application/octet-stream" };

  const created = await fetch(`${base}/api/v1/workspaces/${ws}/media/upload?filename=dot.png`, {
    method: "POST",
    headers,
    body: PNG_1x1,
  });
  const media = await created.json();

  const patched = await fetch(`${base}/api/v1/workspaces/${ws}/media/${media.id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer u_editor", "content-type": "application/json" },
    body: JSON.stringify({ alt: "Renamed", usage: "featured" }),
  });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).alt, "Renamed");

  const replaced = await fetch(`${base}/api/v1/workspaces/${ws}/media/${media.id}/replace?alt=Swapped`, {
    method: "POST",
    headers,
    body: makeJpeg(64, 48),
  });
  assert.equal(replaced.status, 200);
  const after = await replaced.json();
  assert.equal(after.mimeType, "image/jpeg");
  assert.equal(after.alt, "Swapped");
  assert.equal(after.id, media.id);
});

test("media bytes are served from the storage url", async () => {
  const { base, workspace } = await startApi();
  const ws = workspace.id;
  const headers = { authorization: "Bearer u_editor", "content-type": "application/octet-stream" };

  const created = await fetch(`${base}/api/v1/workspaces/${ws}/media/upload?filename=dot.png`, {
    method: "POST",
    headers,
    body: PNG_1x1,
  });
  const media = await created.json();

  const served = await fetch(`${base}${media.url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), new Uint8Array(PNG_1x1));

  const missing = await fetch(`${base}/media/ws_nope/nope.png`);
  assert.equal(missing.status, 404);
});

