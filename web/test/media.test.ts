import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient, ApiError } from "../lib/api";
import {
  parseMediaQuery,
  mediaQueryParams,
  mediaPaginationInfo,
  filterMedia,
  paginateMedia,
  mediaLabel,
  formatBytes,
  mediaDimensions,
  kindOptions,
  usageOptions,
} from "../lib/media";
import type { MediaReference } from "../lib/types";

function media(overrides: Partial<MediaReference> = {}): MediaReference {
  return {
    id: "med_1",
    workspaceId: "ws_1",
    kind: "image",
    url: "/media/ws_1/med_1.png",
    usage: "attachment",
    createdAt: "2026-08-05T10:00:00Z",
    updatedAt: "2026-08-05T10:00:00Z",
    ...overrides,
  };
}

test("parseMediaQuery defaults to page 1 and pageSize 24", () => {
  const query = parseMediaQuery(new URLSearchParams());
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 24);
  assert.equal(query.search, undefined);
  assert.equal(query.kind, undefined);
  assert.equal(query.usage, undefined);
});

test("parseMediaQuery reads filters and coerces page/pageSize", () => {
  const query = parseMediaQuery(new URLSearchParams("page=2&pageSize=48&search=hero&kind=image&usage=featured"));
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 48);
  assert.equal(query.search, "hero");
  assert.equal(query.kind, "image");
  assert.equal(query.usage, "featured");
});

test("parseMediaQuery ignores invalid kind/usage and clamps pageSize", () => {
  const query = parseMediaQuery(new URLSearchParams("page=0&pageSize=9999&kind=bogus&usage=nope"));
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 200);
  assert.equal(query.kind, undefined);
  assert.equal(query.usage, undefined);
});

test("mediaQueryParams omits defaults", () => {
  const params = mediaQueryParams({ page: 1, pageSize: 24 });
  assert.equal(params.toString(), "");
});

test("mediaQueryParams encodes non-default values", () => {
  const params = mediaQueryParams({ page: 3, pageSize: 12, search: "hero", kind: "video", usage: "featured" });
  assert.equal(params.get("page"), "3");
  assert.equal(params.get("pageSize"), "12");
  assert.equal(params.get("search"), "hero");
  assert.equal(params.get("kind"), "video");
  assert.equal(params.get("usage"), "featured");
});

test("mediaPaginationInfo computes totalPages", () => {
  assert.deepEqual(mediaPaginationInfo(0, 1, 24), { page: 1, pageSize: 24, total: 0, totalPages: 0 });
  assert.deepEqual(mediaPaginationInfo(50, 1, 24), { page: 1, pageSize: 24, total: 50, totalPages: 3 });
  assert.deepEqual(mediaPaginationInfo(24, 1, 24), { page: 1, pageSize: 24, total: 24, totalPages: 1 });
});

test("filterMedia filters by kind, usage and search", () => {
  const items = [
    media({ id: "a", kind: "image", usage: "featured", alt: "Hero banner" }),
    media({ id: "b", kind: "video", usage: "attachment", alt: "Interview" }),
    media({ id: "c", kind: "audio", usage: "featured", alt: "Podcast" }),
  ];

  assert.equal(filterMedia(items, { page: 1, pageSize: 24, kind: "image" }).length, 1);
  assert.equal(filterMedia(items, { page: 1, pageSize: 24, usage: "featured" }).length, 2);
  assert.equal(filterMedia(items, { page: 1, pageSize: 24, search: "podcast" }).length, 1);
  assert.equal(filterMedia(items, { page: 1, pageSize: 24, search: "image" }).length, 1);
  assert.equal(filterMedia(items, { page: 1, pageSize: 24, search: "no match" }).length, 0);
  assert.equal(filterMedia(items, { page: 1, pageSize: 24, kind: "image", usage: "featured" }).length, 1);
});

test("paginateMedia slices by page", () => {
  const items = Array.from({ length: 30 }, (_, i) => media({ id: `med_${i}` }));
  assert.equal(paginateMedia(items, 1, 24).length, 24);
  assert.equal(paginateMedia(items, 2, 24).length, 6);
  assert.equal(paginateMedia(items, 3, 24).length, 0);
});

test("mediaLabel falls back to the filename segment", () => {
  assert.equal(mediaLabel(media({ alt: "Hero" })), "Hero");
  assert.equal(mediaLabel(media({ alt: undefined, url: "/media/ws_1/hero%20shot.png" })), "hero shot.png");
  assert.equal(mediaLabel(media({ alt: undefined, url: "/media/ws_1/a.png", id: "med_1" })), "a.png");
});

test("formatBytes humanizes sizes", () => {
  assert.equal(formatBytes(undefined), "Unknown size");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2.0 GB");
});

test("mediaDimensions reports width and height", () => {
  assert.equal(mediaDimensions(media({ width: 1920, height: 1080 })), "1920 × 1080");
  assert.equal(mediaDimensions(media({ width: undefined, height: undefined })), undefined);
});

test("kind and usage option lists cover the full contract", () => {
  assert.deepEqual(kindOptions().map((o) => o.value), ["image", "file", "video", "audio"]);
  assert.deepEqual(usageOptions().map((o) => o.value), ["featured", "attachment"]);
});

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
});

function mockBackend() {
  const store: Record<string, MediaReference> = {};
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const isUploadPath = url.pathname.endsWith("/upload") || url.pathname.endsWith("/replace");
      const body = !isUploadPath && raw.length ? JSON.parse(raw.toString("utf8")) : {};
      const send = (status: number, data: unknown) => {
        const payload = JSON.stringify(data);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload);
      };

      if (url.pathname === "/api/v1/workspaces/ws_1/media" && req.method === "GET") {
        return send(200, Object.values(store));
      }

      if (url.pathname === "/api/v1/workspaces/ws_1/media/upload" && req.method === "POST") {
        const record = media({
          id: "med_new",
          alt: url.searchParams.get("alt") ?? undefined,
          kind: "image",
          mimeType: "image/png",
          sizeBytes: raw.length,
        });
        store[record.id] = record;
        return send(200, record);
      }

      const match = /^\/api\/v1\/workspaces\/ws_1\/media\/([^/]+)(\/replace)?$/.exec(url.pathname);
      if (match) {
        const id = match[1];
        const isReplace = match[2] === "/replace";
        if (isReplace && req.method === "POST") {
          const record = { ...store[id], mimeType: "image/jpeg", sizeBytes: raw.length, alt: url.searchParams.get("alt") ?? store[id].alt };
          store[id] = record;
          return send(200, record);
        }
        if (!isReplace && req.method === "PATCH") {
          const record = { ...store[id], ...body };
          store[id] = record;
          return send(200, record);
        }
        if (!isReplace && req.method === "DELETE") {
          const record = store[id];
          if (!record) return send(404, { error: { code: "NOT_FOUND", message: "No route" } });
          delete store[id];
          return send(200, record);
        }
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

test("api client uploads media as raw bytes", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_editor" });
  const uploaded = await api.uploadMedia("ws_1", new Uint8Array([0x89, 0x50]), {
    filename: "dot.png",
    alt: "A dot",
    usage: "featured",
  });
  assert.equal(uploaded.id, "med_new");
  assert.equal(uploaded.alt, "A dot");
  assert.equal(uploaded.kind, "image");
});

test("api client lists, updates, replaces and deletes media", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_editor" });
  await api.uploadMedia("ws_1", new Uint8Array([1, 2, 3]), { filename: "a.png" });

  const list = await api.listMedia("ws_1");
  assert.equal(list.length, 1);

  const updated = await api.updateMedia("ws_1", "med_new", { alt: "Renamed", usage: "featured" });
  assert.equal(updated.alt, "Renamed");
  assert.equal(updated.usage, "featured");

  const replaced = await api.replaceMedia("ws_1", "med_new", new Uint8Array([9, 9, 9]), { alt: "Swapped" });
  assert.equal(replaced.mimeType, "image/jpeg");
  assert.equal(replaced.alt, "Swapped");
  assert.equal(replaced.id, "med_new");

  const removed = await api.deleteMedia("ws_1", "med_new");
  assert.equal(removed.id, "med_new");
  assert.equal((await api.listMedia("ws_1")).length, 0);
});

test("api client throws ApiError on not found", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_editor" });
  await assert.rejects(() => api.deleteMedia("ws_1", "med_missing"), ApiError);
});
