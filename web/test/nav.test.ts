import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NAV_ITEMS,
  isActive,
  firstLetter,
  initials,
  workspaceLabel,
  roleLabel,
  roleFor,
} from "../lib/nav";

test("nav items cover the dashboard sections", () => {
  const hrefs = NAV_ITEMS.map((item) => item.href);
  assert.ok(hrefs.includes("/dashboard"));
  assert.ok(hrefs.includes("/dashboard/content"));
  assert.ok(hrefs.includes("/dashboard/media"));
  assert.ok(hrefs.includes("/dashboard/analytics"));
  assert.ok(hrefs.includes("/dashboard/ai"));
  assert.ok(hrefs.includes("/dashboard/settings"));
});

test("isActive matches exact dashboard root", () => {
  assert.equal(isActive("/dashboard", "/dashboard"), true);
  assert.equal(isActive("/dashboard", "/dashboard/content"), false);
});

test("isActive matches nested routes for section links", () => {
  assert.equal(isActive("/dashboard/content", "/dashboard/content"), true);
  assert.equal(isActive("/dashboard/content", "/dashboard/content/123"), true);
  assert.equal(isActive("/dashboard/content", "/dashboard/media"), false);
});

test("firstLetter uppercases the first character", () => {
  assert.equal(firstLetter("rohan"), "R");
  assert.equal(firstLetter(""), "?");
  assert.equal(firstLetter("   "), "?");
});

test("initials builds up to two capital letters", () => {
  assert.equal(initials("Meera Author"), "MA");
  assert.equal(initials("Rohan"), "R");
  assert.equal(initials("  alice   smith  "), "AS");
});

test("workspaceLabel prefers name over slug", () => {
  assert.equal(workspaceLabel({ name: "Star Hindis", slug: "star-hindis" }), "Star Hindis");
  assert.equal(workspaceLabel({ name: "", slug: "star-hindis" }), "star-hindis");
});

test("roleLabel picks the highest role in the canonical order", () => {
  assert.equal(roleLabel(["author", "editor"]), "Editor");
  assert.equal(roleLabel(["viewer"]), "Viewer");
  assert.equal(roleLabel(["owner", "editor"]), "Owner");
  assert.equal(roleLabel(["custom"]), "Custom");
  assert.equal(roleLabel([]), "Member");
});

test("roleFor resolves explicit and wildcard memberships", () => {
  const user = {
    memberships: [
      { workspaceId: "ws_1", roles: ["editor"] },
      { workspaceId: "*", roles: ["viewer"] },
    ],
  };
  assert.deepEqual(roleFor(user, "ws_1"), ["editor"]);
  assert.deepEqual(roleFor(user, "ws_2"), ["viewer"]);
  assert.deepEqual(roleFor({ memberships: [] }, "ws_1"), []);
});
