import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTheme,
  resolveTheme,
  toggleTheme,
  themeLabel,
  THEME_STORAGE_KEY,
} from "../lib/theme";

test("isValidTheme accepts only light and dark", () => {
  assert.equal(isValidTheme("light"), true);
  assert.equal(isValidTheme("dark"), true);
  assert.equal(isValidTheme("system"), false);
  assert.equal(isValidTheme(null), false);
  assert.equal(isValidTheme(undefined), false);
});

test("resolveTheme prefers stored theme", () => {
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
});

test("resolveTheme falls back to system preference", () => {
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(null, false), "light");
});

test("toggleTheme flips between light and dark", () => {
  assert.equal(toggleTheme("light"), "dark");
  assert.equal(toggleTheme("dark"), "light");
});

test("themeLabel humanises the value", () => {
  assert.equal(themeLabel("light"), "Light");
  assert.equal(themeLabel("dark"), "Dark");
});

test("storage key is stable", () => {
  assert.equal(THEME_STORAGE_KEY, "shdos-theme");
});
