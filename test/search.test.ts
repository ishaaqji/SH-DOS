import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, buildQuery } from "../src/search/parser";
import { buildFilter, getField } from "../src/search/filters";
import { EventBus } from "../src/kernel/events";
import { SearchIndexService } from "../src/content/search";
import { IndexingHooks, docId, toDocument } from "../src/search/hooks";
import { setup, flush } from "./helpers";
import type { Content, ContentVersion } from "../src/content/types";
import type { SearchDocument } from "../src/search/types";

function doc(overrides: Partial<SearchDocument>): SearchDocument {
  return {
    id: "con_a:en",
    workspaceId: "ws_1",
    locale: "en",
    type: "content",
    title: "Kailash Temple",
    text: "A sacred mountain temple",
    status: "published",
    fields: { contentId: "con_a", contentType: "article", authorId: "u_1" },
    ...overrides,
  };
}

test("parseQuery extracts terms, field filters and exclusions", () => {
  const parsed = parseQuery("shiva temple type:article -draft");
  assert.deepEqual(parsed.terms, ["shiva", "temple"]);
  assert.deepEqual(parsed.filters, [{ field: "type", op: "eq", value: "article" }]);
  assert.deepEqual(parsed.excluded, ["draft"]);
  assert.deepEqual(parseQuery(undefined), { terms: [], filters: [], excluded: [] });
});

test("buildQuery composes a search query from input and options", () => {
  const query = buildQuery("kailash type:article", { locale: "hi", limit: 10, offset: 5 });
  assert.equal(query.term, "kailash");
  assert.equal(query.limit, 10);
  assert.equal(query.offset, 5);
  assert.deepEqual(query.filters, [
    { field: "type", op: "eq", value: "article" },
    { field: "locale", op: "eq", value: "hi" },
  ]);
});

test("buildFilter evaluates equality and membership operators", () => {
  const d = doc({ fields: { contentId: "con_a", contentType: "article", status: "published" } });
  assert.equal(buildFilter([{ field: "contentType", op: "eq", value: "article" }])(d), true);
  assert.equal(buildFilter([{ field: "contentType", op: "eq", value: "video" }])(d), false);
  assert.equal(buildFilter([{ field: "contentType", op: "ne", value: "video" }])(d), true);
  assert.equal(
    buildFilter([{ field: "contentType", op: "in", value: ["video", "article"] }])(d),
    true,
  );
  assert.equal(
    buildFilter([{ field: "contentType", op: "nin", value: ["video", "news"] }])(d),
    true,
  );
});

test("buildFilter evaluates numeric and existence operators", () => {
  const d = doc({ fields: { contentId: "con_a", views: 42 } });
  assert.equal(buildFilter([{ field: "views", op: "gt", value: 10 }])(d), true);
  assert.equal(buildFilter([{ field: "views", op: "lt", value: 10 }])(d), false);
  assert.equal(buildFilter([{ field: "views", op: "range", min: 40, max: 50 }])(d), true);
  assert.equal(buildFilter([{ field: "views", op: "exists" }])(d), true);
  assert.equal(buildFilter([{ field: "missing", op: "exists" }])(d), false);
  assert.equal(getField(d, "id"), "con_a:en");
});

test("provider indexes documents and matches terms", () => {
  const provider = new SearchIndexService();
  provider.index(doc({}));
  provider.index(doc({ id: "con_b:en", title: "Golden Temple", fields: { contentId: "con_b" } }));

  const result = provider.search({ term: "kailash", filters: [], limit: 10, offset: 0 });
  assert.equal(result.total, 1);
  assert.equal(result.hits[0].id, "con_a:en");
  assert.equal(result.hits[0].score, 1);

  const none = provider.search({ term: "beach", filters: [], limit: 10, offset: 0 });
  assert.equal(none.total, 0);
});

test("provider applies filters and pagination", () => {
  const provider = new SearchIndexService();
  provider.index(doc({ id: "con_a:en", fields: { contentId: "con_a", contentType: "article" } }));
  provider.index(doc({ id: "con_b:en", title: "Temple", fields: { contentId: "con_b", contentType: "video" } }));

  const result = provider.search({
    term: "temple",
    filters: [{ field: "contentType", op: "eq", value: "article" }],
    limit: 10,
    offset: 0,
  });
  assert.equal(result.total, 1);
  assert.equal(result.hits[0].id, "con_a:en");

  const paged = provider.search({ term: "", filters: [], limit: 1, offset: 1 });
  assert.equal(paged.total, 2);
  assert.equal(paged.hits.length, 1);
});

test("provider remove drops documents", () => {
  const provider = new SearchIndexService();
  provider.index(doc({}));
  provider.remove("con_a:en");
  const result = provider.search({ term: "kailash", filters: [], limit: 10, offset: 0 });
  assert.equal(result.total, 0);
});

test("indexing hooks keep the provider in sync with domain events", async () => {
  const provider = new SearchIndexService();
  const bus = new EventBus();
  new IndexingHooks(provider).attach(bus);

  const content = {
    id: "con_a",
    workspaceId: "ws_1",
    locale: "en",
    type: "article",
    title: "Sync Test",
    body: "Index me please",
    excerpt: undefined,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Content;

  await bus.emit({ type: "content.created", workspaceId: "ws_1", at: new Date(), payload: { content } });
  let result = provider.search({ term: "index", filters: [], limit: 10, offset: 0 });
  assert.equal(result.total, 1);

  await bus.emit({ type: "content.deleted", workspaceId: "ws_1", at: new Date(), payload: { content } });
  result = provider.search({ term: "index", filters: [], limit: 10, offset: 0 });
  assert.equal(result.total, 0);
});

test("content lifecycle events drive the provider through hooks", async () => {
  const { app, editor, workspace } = setup();
  app.content.create(editor, workspace.id, {
    type: "article",
    title: "Hook Driven Search",
    body: "unique searchable phrase",
  });
  await flush();

  const found = app.content.list(workspace.id, {
    page: 1,
    pageSize: 20,
    sort: "-updatedAt",
    filters: {},
    search: "hook driven",
  });
  assert.equal(found.total, 1);
});

test("docId and toDocument map content to a document", () => {
  const content = {
    id: "con_x",
    workspaceId: "ws_1",
    locale: "hi",
    type: "news",
    title: "Title",
    body: "Body",
    excerpt: "Excerpt",
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    categoryIds: ["c1"],
    tagIds: ["t1"],
  } as unknown as Content;
  assert.equal(docId(content), "con_x:hi");
  const document = toDocument(content);
  assert.equal(document.fields.contentId, "con_x");
  assert.equal((document.fields.categoryIds as string[])[0], "c1");
  assert.ok(document.text?.includes("Body"));
});
