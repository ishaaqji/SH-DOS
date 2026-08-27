import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, flush } from "./helpers";

test("workflow transitions are recorded in the audit log", async () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, { type: "article", title: "Audited" });
  await flush();

  app.content.transition(editor, workspace.id, content.id, "review");
  app.content.transition(editor, workspace.id, content.id, "draft");
  await flush();

  const audit = app.publishing.audit(workspace.id, content.id);
  assert.equal(audit.length, 3);
  assert.equal(audit[0].to, "draft");
  assert.equal(audit[0].from, undefined);
  assert.equal(audit[1].to, "review");
  assert.equal(audit[1].from, "draft");
  assert.equal(audit[2].to, "draft");
  assert.equal(audit[2].from, "review");
  assert.equal(audit[1].actorId, editor.id);
});

test("full publishing lifecycle records each transition once", async () => {
  const { app, editor, workspace } = setup();
  const reviewer = app.identity.createUser({
    email: "r@t.test",
    name: "R",
    memberships: [{ workspaceId: workspace.id, roles: ["reviewer"] }],
  });
  const content = app.content.create(editor, workspace.id, { type: "news", title: "Lifecycle" });
  await flush();

  app.content.transition(editor, workspace.id, content.id, "review");
  app.content.transition(reviewer, workspace.id, content.id, "approved");
  app.content.transition(editor, workspace.id, content.id, "published");
  app.content.transition(editor, workspace.id, content.id, "archived");
  app.content.transition(editor, workspace.id, content.id, "draft");
  await flush();

  const audit = app.publishing.audit(workspace.id, content.id);
  assert.deepEqual(audit.map((a) => a.to), ["draft", "review", "approved", "published", "archived", "draft"]);
  assert.deepEqual(audit.map((a) => a.from), [undefined, "draft", "review", "approved", "published", "archived"]);
  assert.equal(audit.find((a) => a.to === "approved")?.actorId, reviewer.id);
});

test("scheduling and scheduled publishing are recorded", async () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, { type: "event", title: "Scheduled" });
  await flush();

  app.content.schedule(editor, workspace.id, content.id, new Date(Date.now() + 3600_000).toISOString());
  await flush();

  let audit = app.publishing.audit(workspace.id, content.id);
  assert.equal(audit.length, 2);
  assert.equal(audit[1].to, "draft");
  assert.ok(audit[1].note?.startsWith("Scheduled for"));

  app.publishing.publishDue(new Date(Date.now() + 7200_000));
  await flush();

  audit = app.publishing.audit(workspace.id, content.id);
  assert.equal(audit.length, 3);
  assert.equal(audit[2].to, "published");
  assert.equal(audit[2].from, "draft");
});

test("allowed transitions reflect the current status", () => {
  const { app, editor, workspace } = setup();
  const content = app.content.create(editor, workspace.id, { type: "page", title: "Status" });
  assert.deepEqual(app.publishing.allowedTransitions(content.status), ["review"]);
  app.content.transition(editor, workspace.id, content.id, "review");
  assert.deepEqual(app.publishing.allowedTransitions("review"), ["approved", "draft"]);
});

test("audit log is scoped per content and workspace", async () => {
  const { app, editor, workspace } = setup();
  const a = app.content.create(editor, workspace.id, { type: "page", title: "A" });
  const b = app.content.create(editor, workspace.id, { type: "page", title: "B" });
  app.content.transition(editor, workspace.id, a.id, "review");
  await flush();

  assert.equal(app.publishing.audit(workspace.id, a.id).length, 2);
  assert.equal(app.publishing.audit(workspace.id, b.id).length, 1);
});
