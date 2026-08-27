import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, flush } from "./helpers";
import { ValidationError } from "../src/kernel/errors";

function setupWithReviewer() {
  const h = setup();
  const reviewer = h.identity.createUser({
    email: "reviewer@shdos.test",
    name: "Priya Reviewer",
    memberships: [{ workspaceId: h.workspace.id, roles: ["reviewer"] }],
  });
  return { ...h, reviewer };
}

test("requesting a translation runs the auto hook and creates a target", async () => {
  const { app, editor, workspace } = setup();
  const source = app.content.create(editor, workspace.id, {
    type: "article",
    title: "Kailash Temple",
    body: "A sacred mountain temple.",
  });
  const translation = await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  assert.equal(translation.status, "auto");
  assert.equal(translation.locale, "hi");

  const all = app.content.translations(workspace.id, source.id);
  assert.equal(all.length, 1);

  const resolved = app.content.resolve(workspace.id, source.id, "hi");
  assert.equal(resolved.viaTranslation, true);
  assert.equal(resolved.resolvedLocale, "hi");
  assert.ok(resolved.content.title.includes("hi"));
  assert.equal(resolved.content.sourceContentId, source.id);
});

test("requesting the same translation twice is idempotent", async () => {
  const { app, editor, workspace } = setup();
  const source = app.content.create(editor, workspace.id, { type: "article", title: "Once" });
  await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  assert.equal(app.content.translations(workspace.id, source.id).length, 1);
});

test("locale fallback resolves to source when no translation exists", () => {
  const { app, editor, workspace } = setup();
  const source = app.content.create(editor, workspace.id, { type: "page", title: "About Us" });
  const resolved = app.content.resolve(workspace.id, source.id, "ta");
  assert.equal(resolved.fallback, true);
  assert.equal(resolved.viaTranslation, false);
  assert.equal(resolved.content.id, source.id);
  assert.equal(resolved.resolvedLocale, "en");
});

test("unknown locale is rejected", async () => {
  const { app, editor, workspace } = setup();
  const source = app.content.create(editor, workspace.id, { type: "article", title: "T" });
  await assert.rejects(
    app.content.requestTranslation(editor, workspace.id, source.id, "xx"),
    ValidationError,
  );
});

test("human review flow: auto -> in_review -> approved", async () => {
  const { app, editor, reviewer, workspace } = setupWithReviewer();
  const source = app.content.create(editor, workspace.id, { type: "news", title: "Breaking" });
  const translation = await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  assert.equal(translation.status, "auto");

  const inReview = app.content.reviewTranslation(reviewer, workspace.id, translation.id, "mark_review");
  assert.equal(inReview.status, "in_review");

  const approved = app.content.reviewTranslation(reviewer, workspace.id, translation.id, "approve");
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewedBy, reviewer.id);
  assert.ok(approved.reviewedAt);
});

test("reviewer can request changes back to needs_review", async () => {
  const { app, editor, reviewer, workspace } = setupWithReviewer();
  const source = app.content.create(editor, workspace.id, { type: "article", title: "Draft Copy" });
  const translation = await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  app.content.reviewTranslation(reviewer, workspace.id, translation.id, "mark_review");
  const changed = app.content.reviewTranslation(reviewer, workspace.id, translation.id, "request_changes");
  assert.equal(changed.status, "needs_review");
});

test("author can request translations but not approve them", async () => {
  const { app, author, workspace } = setup();
  const source = app.content.create(author, workspace.id, { type: "article", title: "Local" });
  const translation = await app.content.requestTranslation(author, workspace.id, source.id, "hi");
  assert.equal(translation.status, "auto");

  const another = app.identity.createUser({
    email: "stranger@shdos.test",
    name: "Stranger",
    memberships: [],
  });
  assert.throws(
    () => app.content.reviewTranslation(another, workspace.id, translation.id, "approve"),
    /Missing permission|Not a member/,
  );
});

test("translation target participates in search index", async () => {
  const { app, editor, workspace } = setup();
  const source = app.content.create(editor, workspace.id, {
    type: "article",
    title: "Char Dham Yatra",
    body: "Four sacred abodes.",
  });
  await app.content.requestTranslation(editor, workspace.id, source.id, "hi");
  await flush();

  const found = app.content.list(workspace.id, {
    page: 1,
    pageSize: 20,
    sort: "-updatedAt",
    filters: { locale: "hi" },
    search: "char",
  });
  assert.equal(found.total, 1);
  assert.equal(found.items[0].locale, "hi");
});
