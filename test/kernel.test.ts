import { test } from "node:test";
import assert from "node:assert/strict";
import { newId, now } from "../src/kernel/ids";
import { slugify, ensureUniqueSlug } from "../src/content/slug";
import { findTransition, nextStatuses, WORKFLOW_ORDER } from "../src/content/workflow";
import { parsePageQuery, paginate } from "../src/kernel/pagination";
import { hasPermission } from "../src/identity/permissions";

test("newId generates prefixed, unique ids", () => {
  const a = newId("con");
  const b = newId("con");
  assert.ok(a.startsWith("con_"));
  assert.notEqual(a, b);
});

test("now returns a valid ISO timestamp", () => {
  assert.ok(!Number.isNaN(Date.parse(now())));
});

test("slugify normalizes titles", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  Big   Temple "), "big-temple");
  assert.equal(slugify("Café Öl"), "cafe-ol");
  assert.equal(slugify("!!!"), "untitled");
});

test("ensureUniqueSlug appends numeric suffixes", () => {
  const taken = new Set(["news", "news-2"]);
  const isTaken = (s: string): boolean => taken.has(s);
  assert.equal(ensureUniqueSlug("news", isTaken), "news-3");
  assert.equal(ensureUniqueSlug("fresh", isTaken), "fresh");
});

test("workflow covers the full lifecycle and rejects illegal jumps", () => {
  assert.equal(WORKFLOW_ORDER.length, 5);
  assert.ok(findTransition("draft", "review"));
  assert.ok(findTransition("review", "approved"));
  assert.ok(findTransition("approved", "published"));
  assert.ok(findTransition("published", "archived"));
  assert.ok(findTransition("archived", "draft"));
  assert.equal(findTransition("draft", "published"), undefined);
  assert.equal(findTransition("approved", "archived"), undefined);
  assert.deepEqual(nextStatuses("published"), ["draft", "archived"]);
});

test("parsePageQuery parses pagination, sort, filters and search", () => {
  const q = parsePageQuery({
    page: "2",
    pageSize: "50",
    sort: "title",
    type: "article",
    status: "published",
    search: "shiva",
  });
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 50);
  assert.equal(q.sort, "title");
  assert.equal(q.filters.type, "article");
  assert.equal(q.filters.status, "published");
  assert.equal(q.search, "shiva");
});

test("parsePageQuery clamps page size", () => {
  const q = parsePageQuery({ pageSize: "9999" });
  assert.equal(q.pageSize, 100);
});

test("paginate slices and computes totals", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
  const q = parsePageQuery({ page: "2", pageSize: "2" });
  const result = paginate(items, q);
  assert.equal(result.total, 5);
  assert.equal(result.totalPages, 3);
  assert.equal(result.page, 2);
  assert.deepEqual(result.items.map((i) => i.id), ["2", "3"]);
});

test("role permissions enforce access rules", () => {
  assert.ok(hasPermission(["author"], "content", "create"));
  assert.ok(!hasPermission(["author"], "content", "publish"));
  assert.ok(!hasPermission(["author"], "content", "delete"));
  assert.ok(hasPermission(["editor"], "content", "publish"));
  assert.ok(hasPermission(["reviewer"], "content", "review"));
  assert.ok(hasPermission(["reviewer"], "translation", "review"));
  assert.ok(!hasPermission(["reviewer"], "content", "publish"));
  assert.ok(hasPermission(["owner"], "media", "manage"));
  assert.ok(!hasPermission(["viewer"], "content", "update"));
});
