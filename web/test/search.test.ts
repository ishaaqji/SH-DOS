import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiClient } from "../lib/api";
import { parseContentQuery, contentQueryParams, paginationInfo, pagerItems, DEFAULT_PAGE_SIZE } from "../lib/content";
import { hasActiveSearch, resultCountLabel } from "../lib/search";
import type { Content } from "../lib/types";

test("hasActiveSearch is false with no query or filters", () => {
  const query = parseContentQuery(new URLSearchParams());
  assert.equal(hasActiveSearch(query), false);
});

test("hasActiveSearch is true for a term or any filter", () => {
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("search=news"))), true);
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("type=article"))), true);
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("status=published"))), true);
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("locale=en"))), true);
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("category=cat_1"))), true);
  assert.equal(hasActiveSearch(parseContentQuery(new URLSearchParams("tag=tag_1"))), true);
});

test("resultCountLabel pluralises correctly", () => {
  assert.equal(resultCountLabel(1), "1 result");
  assert.equal(resultCountLabel(0), "0 results");
  assert.equal(resultCountLabel(12), "12 results");
});

test("search query parses term, filters and pagination", () => {
  const query = parseContentQuery(
    new URLSearchParams("search=breaking&type=article&status=published&locale=en&category=cat_1&tag=tag_1&page=3&pageSize=10"),
  );
  assert.equal(query.search, "breaking");
  assert.equal(query.type, "article");
  assert.equal(query.status, "published");
  assert.equal(query.locale, "en");
  assert.equal(query.category, "cat_1");
  assert.equal(query.tag, "tag_1");
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 10);
});

test("search query omits invalid type and clamps pageSize", () => {
  const query = parseContentQuery(new URLSearchParams("search=x&type=bogus&pageSize=9999"));
  assert.equal(query.search, "x");
  assert.equal(query.type, undefined);
  assert.equal(query.pageSize, 100);
});

test("search query params omit defaults", () => {
  const params = contentQueryParams({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: "-updatedAt" });
  assert.equal(params.toString(), "");
});

test("search query params encode term and filters", () => {
  const params = contentQueryParams({
    page: 2,
    pageSize: 10,
    sort: "-updatedAt",
    search: "breaking",
    type: "news",
    status: "draft",
    locale: "en",
    category: "cat_1",
    tag: "tag_1",
  });
  assert.equal(params.get("search"), "breaking");
  assert.equal(params.get("type"), "news");
  assert.equal(params.get("status"), "draft");
  assert.equal(params.get("locale"), "en");
  assert.equal(params.get("category"), "cat_1");
  assert.equal(params.get("tag"), "tag_1");
});

test("paginationInfo computes totalPages", () => {
  assert.deepEqual(paginationInfo(0, 1, 10), { page: 1, pageSize: 10, total: 0, totalPages: 0 });
  assert.deepEqual(paginationInfo(25, 1, 10), { page: 1, pageSize: 10, total: 25, totalPages: 3 });
});

test("pagerItems includes first, last and window pages", () => {
  assert.deepEqual(pagerItems(3, 10), [1, 2, 3, 4, 5, 10]);
});

function content(overrides: Partial<Content> = {}): Content {
  return {
    id: "con_1",
    workspaceId: "ws_1",
    type: "article",
    title: "Breaking news",
    slug: "breaking-news",
    body: "Body text",
    excerpt: "A short excerpt",
    status: "published",
    categoryIds: [],
    tagIds: [],
    attachmentIds: [],
    locale: "en",
    seo: {},
    createdAt: "2026-08-05T10:00:00Z",
    updatedAt: "2026-08-05T10:00:00Z",
    ...overrides,
  };
}

const servers: Server[] = [];
after(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
});

function mockBackend() {
  const store: Content[] = [content(), content({ id: "con_2", type: "video", title: "Launch video", slug: "launch", status: "draft", locale: "hi" })];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (url.pathname === "/api/v1/workspaces/ws_1/content" && req.method === "GET") {
      let items = [...store];
      const search = url.searchParams.get("search");
      if (search) {
        const tokens = search.toLowerCase().split(/\s+/);
        items = items.filter((c) => tokens.every((t) => `${c.title} ${c.body}`.toLowerCase().includes(t)));
      }
      const type = url.searchParams.get("type");
      if (type) items = items.filter((c) => c.type === type);
      const status = url.searchParams.get("status");
      if (status) items = items.filter((c) => c.status === status);
      const locale = url.searchParams.get("locale");
      if (locale) items = items.filter((c) => c.locale === locale);
      const category = url.searchParams.get("category");
      if (category) items = items.filter((c) => c.categoryIds.includes(category));
      const tag = url.searchParams.get("tag");
      if (tag) items = items.filter((c) => c.tagIds.includes(tag));

      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
      const start = (page - 1) * pageSize;
      const total = items.length;
      return send(200, {
        items: items.slice(start, start + pageSize),
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      });
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

test("api client searches content by term", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const result = await api.listContent("ws_1", { page: 1, pageSize: 20, search: "launch" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].title, "Launch video");
});

test("api client combines search with type and status filters", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const result = await api.listContent("ws_1", {
    page: 1,
    pageSize: 20,
    search: "video",
    type: "video",
    status: "draft",
  });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "con_2");
});

test("api client filters by locale", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const result = await api.listContent("ws_1", { page: 1, pageSize: 20, locale: "en" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].locale, "en");
});

test("api client paginates results", async () => {
  const { baseUrl } = await mockBackend();
  const api = createApiClient({ baseUrl, getToken: () => "u_owner" });
  const page1 = await api.listContent("ws_1", { page: 1, pageSize: 1 });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.total, 2);
  assert.equal(page1.totalPages, 2);
  const page2 = await api.listContent("ws_1", { page: 2, pageSize: 1 });
  assert.equal(page2.items[0].id, "con_2");
});
