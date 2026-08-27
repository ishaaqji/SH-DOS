import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, flush } from "./helpers";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/kernel/errors";

test("create content starts as draft with slug and canonical url", () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, {
    type: "article",
    title: "Kailash Temple Guide",
    body: "The abode of Shiva.",
    seo: { description: "A guide to Mount Kailash", keywords: ["temple", "shiva"] },
  });
  assert.equal(content.status, "draft");
  assert.equal(content.slug, "kailash-temple-guide");
  assert.equal(content.locale, "en");
  assert.equal(content.canonicalUrl, "https://starbharat.example/en/kailash-temple-guide");
  assert.equal(content.seo.keywords?.length, 2);
});

test("edit content creates a version snapshot", () => {
  const { app, editor, workspace } = setup();
  const created = app.content.create(editor, workspace.id, { type: "news", title: "Headline One" });
  const updated = app.content.update(editor, workspace.id, created.id, {
    title: "Headline Two",
    body: "Full story",
    changeSummary: "Editorial update",
  });
  assert.equal(updated.title, "Headline Two");
  const versions = app.content.versions(created.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].versionNumber, 1);
  assert.equal(versions[1].versionNumber, 2);
  assert.equal(versions[1].changeSummary, "Editorial update");
  const v1 = app.content.getVersion(created.id, 1);
  assert.equal(v1.title, "Headline One");
});

test("slug stays stable across title edits unless provided", () => {
  const { app, editor, workspace } = setup();
  const created = app.content.create(editor, workspace.id, { type: "page", title: "Stable URL" });
  const updated = app.content.update(editor, workspace.id, created.id, { title: "New Title" });
  assert.equal(updated.slug, "stable-url");
  const renamed = app.content.update(editor, workspace.id, created.id, { slug: "custom-slug" });
  assert.equal(renamed.slug, "custom-slug");
});

test("duplicate titles produce unique slugs", () => {
  const { app, editor, workspace } = setup();
  const a = app.content.create(editor, workspace.id, { type: "article", title: "Same Title" });
  const b = app.content.create(editor, workspace.id, { type: "article", title: "Same Title" });
  assert.equal(a.slug, "same-title");
  assert.equal(b.slug, "same-title-2");
});

test("full workflow: draft -> review -> approved -> published -> archived", () => {
  const { app, editor, reviewer, workspace } = setupHarnessWithReviewer();
  const content = app.content.create(editor, workspace.id, { type: "article", title: "Workflow Piece" });

  const inReview = app.content.transition(editor, workspace.id, content.id, "review");
  assert.equal(inReview.status, "review");

  const approved = app.content.transition(reviewer, workspace.id, content.id, "approved");
  assert.equal(approved.status, "approved");

  const published = app.content.transition(editor, workspace.id, content.id, "published");
  assert.equal(published.status, "published");
  assert.ok(published.publishedAt);

  const archived = app.content.transition(editor, workspace.id, content.id, "archived");
  assert.equal(archived.status, "archived");

  const restored = app.content.transition(editor, workspace.id, content.id, "draft");
  assert.equal(restored.status, "draft");
});

function setupHarnessWithReviewer() {
  const h = setup();
  const reviewer = h.identity.createUser({
    email: "reviewer@shdos.test",
    name: "Priya Reviewer",
    memberships: [{ workspaceId: h.workspace.id, roles: ["reviewer"] }],
  });
  return { ...h, reviewer };
}

test("author cannot publish or approve; reviewer cannot publish", () => {
  const { app, author, reviewer, workspace } = setupHarnessWithReviewer();
  const content = app.content.create(author, workspace.id, { type: "article", title: "Permissions" });

  const inReview = app.content.transition(author, workspace.id, content.id, "review");
  assert.equal(inReview.status, "review");

  assert.throws(
    () => app.content.transition(author, workspace.id, content.id, "approved"),
    ForbiddenError,
  );
  assert.throws(
    () => app.content.transition(reviewer, workspace.id, content.id, "published"),
    ValidationError,
  );

  const approved = app.content.transition(reviewer, workspace.id, content.id, "approved");
  assert.equal(approved.status, "approved");

  assert.throws(
    () => app.content.transition(author, workspace.id, content.id, "published"),
    ForbiddenError,
  );
});

test("scheduling publishes content when due", () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, { type: "event", title: "Kumbh Mela" });
  const future = new Date(Date.now() + 3600_000).toISOString();
  const scheduled = app.content.schedule(editor, workspace.id, content.id, future);
  assert.equal(scheduled.scheduledAt, future);
  assert.equal(scheduled.status, "draft");

  const published = app.content.runScheduler(new Date(Date.now() + 7200_000));
  assert.equal(published.length, 1);
  assert.equal(published[0].id, content.id);
  assert.equal(published[0].status, "published");
  assert.ok(published[0].publishedAt);
});

test("soft delete removes content from reads and restore brings it back", () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, { type: "page", title: "Temporary" });
  app.content.delete(editor, workspace.id, content.id);
  assert.throws(() => app.content.resolve(workspace.id, content.id), NotFoundError);
  assert.equal(app.content.list(workspace.id, { page: 1, pageSize: 20, sort: "-updatedAt", filters: {} }).total, 0);

  const restored = app.content.restore(editor, workspace.id, content.id);
  assert.equal(restored.status, "draft");
  assert.equal(app.content.resolve(workspace.id, content.id).content.id, content.id);
});

test("search indexing hook makes content discoverable", async () => {
  const { app, editor, workspace } = setup();
  app.content.create(editor, workspace.id, { type: "knowledge_base", title: "Kailash Temple", body: "A sacred mountain pilgrimage site." });
  app.content.create(editor, workspace.id, { type: "news", title: "Weather Report", body: "Rain expected tonight." });
  await flush();

  const found = app.content.list(workspace.id, { page: 1, pageSize: 20, sort: "-updatedAt", filters: {}, search: "kailash" });
  assert.equal(found.total, 1);
  assert.equal(found.items[0].title, "Kailash Temple");

  const none = app.content.list(workspace.id, { page: 1, pageSize: 20, sort: "-updatedAt", filters: {}, search: "unrelated" });
  assert.equal(none.total, 0);
});

test("list filters by type, status, category and tag", () => {
  const { app, editor, workspace } = setup();
  const category = app.content.createCategory(editor, workspace.id, { name: "Pilgrimage", type: "article" });
  const tag = app.content.createTag(editor, workspace.id, { name: "himalaya" });
  app.content.create(editor, workspace.id, {
    type: "article",
    title: "Categorized",
    categoryIds: [category.id],
    tagIds: [tag.id],
  });
  app.content.create(editor, workspace.id, { type: "video", title: "Uncategorized" });

  const base = { page: 1, pageSize: 20, sort: "-updatedAt" };
  const byType = app.content.list(workspace.id, { ...base, filters: { type: "article" } });
  assert.equal(byType.total, 1);

  const byStatus = app.content.list(workspace.id, { ...base, filters: { status: "draft" } });
  assert.equal(byStatus.total, 2);

  const byCategory = app.content.list(workspace.id, { ...base, filters: { category: category.id } });
  assert.equal(byCategory.total, 1);
  assert.equal(byCategory.items[0].title, "Categorized");

  const byTag = app.content.list(workspace.id, { ...base, filters: { tag: tag.id } });
  assert.equal(byTag.total, 1);
});

test("media references support featured images and attachments", () => {
  const { app, editor, workspace } = setup();
  const featured = app.content.createMedia(editor, workspace.id, {
    kind: "image",
    url: "https://cdn.example/featured.jpg",
    usage: "featured",
    alt: "Mount Kailash",
  });
  const content = app.content.create(editor, workspace.id, { type: "article", title: "With Media" });
  const updated = app.content.update(editor, workspace.id, content.id, {
    featuredImageId: featured.id,
    attachmentIds: [featured.id],
  });
  assert.equal(updated.featuredImageId, featured.id);
  assert.deepEqual(updated.attachmentIds, [featured.id]);
});

test("invalid inputs are rejected", () => {
  const { app, editor, workspace } = setup();
  assert.throws(
    () => app.content.create(editor, workspace.id, { type: "article", title: "" }),
    ValidationError,
  );
  assert.throws(
    () => app.content.create(editor, workspace.id, { type: "hologram" as never, title: "Bad" }),
    ValidationError,
  );
  assert.throws(
    () => app.content.create(editor, workspace.id, { type: "article", title: "X", locale: "xx" }),
    ValidationError,
  );
});
