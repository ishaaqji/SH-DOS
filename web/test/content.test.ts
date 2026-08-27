import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseContentQuery,
  contentQueryParams,
  paginationInfo,
  pagerItems,
  DEFAULT_PAGE_SIZE,
} from "../lib/content";
import { contentTypeLabel, statusLabel, statusVariant, CONTENT_TYPES, STATUS_ORDER } from "../lib/status";
import { canDeleteContent, canManageContent } from "../lib/permissions";

test("parseContentQuery defaults to page 1 and -updatedAt", () => {
  const query = parseContentQuery(new URLSearchParams());
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(query.sort, "-updatedAt");
  assert.equal(query.search, undefined);
  assert.equal(query.type, undefined);
  assert.equal(query.status, undefined);
});

test("parseContentQuery reads filters and coerces page/pageSize", () => {
  const query = parseContentQuery(
    new URLSearchParams("page=3&pageSize=25&sort=title&search=breaking&type=article&status=published&category=cat_1&tag=tag_2&locale=en"),
  );
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 25);
  assert.equal(query.sort, "title");
  assert.equal(query.search, "breaking");
  assert.equal(query.type, "article");
  assert.equal(query.status, "published");
  assert.equal(query.category, "cat_1");
  assert.equal(query.tag, "tag_2");
  assert.equal(query.locale, "en");
});

test("parseContentQuery ignores invalid type and status values", () => {
  const query = parseContentQuery(
    new URLSearchParams("type=bogus&status=nope&page=0&pageSize=9999"),
  );
  assert.equal(query.type, undefined);
  assert.equal(query.status, undefined);
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 100);
});

test("contentQueryParams omits defaults", () => {
  const params = contentQueryParams({ page: 1, pageSize: 20, sort: "-updatedAt" });
  assert.equal(params.toString(), "");
});

test("contentQueryParams encodes non-default values", () => {
  const params = contentQueryParams({
    page: 2,
    pageSize: 50,
    sort: "title",
    search: "breaking",
    type: "news",
    status: "draft",
  });
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "50");
  assert.equal(params.get("sort"), "title");
  assert.equal(params.get("search"), "breaking");
  assert.equal(params.get("type"), "news");
  assert.equal(params.get("status"), "draft");
});

test("paginationInfo computes totalPages and clamps to at least 1 for non-empty", () => {
  assert.deepEqual(paginationInfo(0, 1, 20), { page: 1, pageSize: 20, total: 0, totalPages: 0 });
  assert.deepEqual(paginationInfo(45, 1, 20), { page: 1, pageSize: 20, total: 45, totalPages: 3 });
  assert.deepEqual(paginationInfo(20, 1, 20), { page: 1, pageSize: 20, total: 20, totalPages: 1 });
});

test("pagerItems returns spread window with first and last pages", () => {
  assert.deepEqual(pagerItems(1, 1), []);
  assert.deepEqual(pagerItems(1, 5), [1, 2, 3, 5]);
  assert.deepEqual(pagerItems(3, 10), [1, 2, 3, 4, 5, 10]);
  assert.deepEqual(pagerItems(10, 10), [1, 8, 9, 10]);
});

test("contentTypeLabel and statusLabel humanize values", () => {
  assert.equal(contentTypeLabel("business_listing"), "Business listing");
  assert.equal(contentTypeLabel("unknown"), "unknown");
  assert.equal(statusLabel("published"), "Published");
  assert.equal(statusLabel("unknown"), "unknown");
});

test("statusVariant maps workflow statuses to badge variants", () => {
  assert.equal(statusVariant("published"), "success");
  assert.equal(statusVariant("draft"), "neutral");
  assert.equal(statusVariant("approved"), "primary");
  assert.equal(statusVariant("review"), "warning");
  assert.equal(statusVariant("archived"), "danger");
  assert.equal(statusVariant("unknown"), "neutral");
});

test("content and status option lists cover the full contract", () => {
  assert.ok(CONTENT_TYPES.length > 0);
  assert.ok(STATUS_ORDER.length > 0);
  assert.ok(CONTENT_TYPES.includes("article"));
  assert.ok(STATUS_ORDER.includes("published"));
});

test("permission helpers gate by role", () => {
  assert.equal(canDeleteContent(["owner", "admin", "editor"]), true);
  assert.equal(canDeleteContent(["author", "viewer", "reviewer"]), false);
  assert.equal(canManageContent(["author"]), true);
  assert.equal(canManageContent(["viewer"]), false);
  assert.equal(canManageContent([]), false);
});
