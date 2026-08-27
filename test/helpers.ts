import { createApp, type App } from "../src/app";
import type { IdentityService, User, Workspace } from "../src/identity/identity";

export interface TestHarness {
  app: App;
  identity: IdentityService;
  owner: User;
  editor: User;
  author: User;
  workspace: Workspace;
}

export function setup(): TestHarness {
  const app = createApp();
  const owner = app.identity.getUser("u_owner");
  const editor = app.identity.getUser("u_editor");
  const author = app.identity.getUser("u_author");
  const workspace = app.identity.listWorkspaces()[0];
  return { app, identity: app.identity, owner, editor, author, workspace };
}

export const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
