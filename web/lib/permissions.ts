const DELETE_ROLES = new Set(["owner", "admin", "editor"]);
const MANAGE_ROLES = new Set(["owner", "admin", "editor", "author"]);
const AI_MANAGE_ROLES = new Set(["owner", "admin", "editor"]);
const AI_USE_ROLES = new Set(["owner", "admin", "editor", "author"]);

export function canDeleteContent(roles: string[]): boolean {
  return roles.some((role) => DELETE_ROLES.has(role));
}

export function canManageContent(roles: string[]): boolean {
  return roles.some((role) => MANAGE_ROLES.has(role));
}

export function canManageAi(roles: string[]): boolean {
  return roles.some((role) => AI_MANAGE_ROLES.has(role));
}

export function canUseAi(roles: string[]): boolean {
  return roles.some((role) => AI_USE_ROLES.has(role));
}
