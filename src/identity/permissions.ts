export type Resource =
  | "workspace"
  | "content"
  | "category"
  | "tag"
  | "language"
  | "media"
  | "author"
  | "translation"
  | "ai";

export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "publish"
  | "review"
  | "archive"
  | "translate"
  | "manage"
  | "use";

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*:*"],
  admin: ["*:*"],
  editor: [
    "content:create", "content:read", "content:update", "content:delete",
    "content:publish", "content:archive", "content:translate",
    "category:create", "category:read", "category:update", "category:delete",
    "tag:create", "tag:read", "tag:update", "tag:delete",
    "language:create", "language:read", "language:update", "language:delete",
    "media:create", "media:read", "media:update", "media:delete",
    "author:create", "author:read", "author:update", "author:delete",
    "translation:create", "translation:read", "translation:update", "translation:delete",
    "ai:read", "ai:use", "ai:manage",
  ],
  reviewer: ["content:read", "content:review", "translation:read", "translation:review"],
  author: [
    "content:create", "content:read", "content:update", "content:translate",
    "translation:read", "category:read", "tag:read",
    "media:create", "media:read", "author:read",
    "ai:read", "ai:use",
  ],
  viewer: [
    "content:read", "category:read", "tag:read", "language:read",
    "media:read", "author:read", "translation:read",
    "ai:read",
  ],
};

export function hasPermission(roles: string[], resource: Resource, action: Action): boolean {
  const wanted = `${resource}:${action}`;
  for (const role of roles) {
    const permissions = ROLE_PERMISSIONS[role] ?? [];
    for (const permission of permissions) {
      if (permission === "*:*" || permission === wanted) return true;
    }
  }
  return false;
}
