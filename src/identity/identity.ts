import { MemoryStore, type Store, type Storable } from "../kernel/store";
import { newId } from "../kernel/ids";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../kernel/errors";
import { hasPermission, type Action, type Resource } from "./permissions";

export interface Membership {
  workspaceId: string;
  roles: string[];
}

export interface User extends Storable {
  email: string;
  name: string;
  memberships: Membership[];
  active: boolean;
  password?: string;
}

export interface Workspace extends Storable {
  name: string;
  slug: string;
  baseUrl?: string;
  defaultLocale: string;
}

export class IdentityService {
  constructor(
    private users: Store<User> = new MemoryStore<User>(),
    private workspaces: Store<Workspace> = new MemoryStore<Workspace>(),
  ) {}

  createWorkspace(input: {
    name: string;
    slug?: string;
    baseUrl?: string;
    defaultLocale?: string;
    ownerId: string;
  }): Workspace {
    const slug = input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (this.workspaces.find((w) => w.slug === slug).length > 0) {
      throw new ValidationError(`Workspace slug ${slug} already exists`);
    }
    const workspace: Workspace = {
      id: newId("ws"),
      name: input.name,
      slug,
      baseUrl: input.baseUrl,
      defaultLocale: input.defaultLocale ?? "en",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.workspaces.insert(workspace);
    const user = this.users.require(input.ownerId);
    const memberships = user.memberships.filter((m) => m.workspaceId !== workspace.id);
    memberships.push({ workspaceId: workspace.id, roles: ["owner"] });
    this.users.update(user.id, { memberships });
    return workspace;
  }

  getWorkspace(id: string): Workspace {
    return this.workspaces.require(id);
  }

  listWorkspaces(): Workspace[] {
    return this.workspaces.list();
  }

  createUser(input: { id?: string; email: string; name: string; memberships?: Membership[]; password?: string }): User {
    const user: User = {
      id: input.id ?? newId("usr"),
      email: input.email,
      name: input.name,
      memberships: input.memberships ?? [],
      active: true,
      password: input.password,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.users.insert(user);
  }

  getUser(id: string): User {
    return this.users.require(id);
  }

  addMembership(userId: string, workspaceId: string, roles: string[]): User {
    const user = this.users.require(userId);
    const memberships = user.memberships.filter((m) => m.workspaceId !== workspaceId);
    memberships.push({ workspaceId, roles });
    return this.users.update(userId, { memberships });
  }

  authenticate(token?: string): User {
    if (!token) throw new UnauthorizedError("Authentication required");
    const user = this.users.get(token);
    if (!user || !user.active) throw new UnauthorizedError("Invalid or inactive session");
    return user;
  }

  findByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === normalized)[0];
  }

  login(email: string, password?: string): User {
    const user = this.findByEmail(email);
    if (!user || !user.active) throw new UnauthorizedError("Invalid email or password");
    if (user.password && user.password !== password) {
      throw new UnauthorizedError("Invalid email or password");
    }
    return user;
  }

  workspacesFor(user: User): Workspace[] {
    const all = this.listWorkspaces();
    const wildcard = user.memberships.some((m) => m.workspaceId === "*");
    if (wildcard) return all;
    const ids = new Set(user.memberships.map((m) => m.workspaceId));
    return all.filter((w) => ids.has(w.id));
  }

  rolesFor(user: User, workspaceId: string): string[] {
    const exact = user.memberships.find((m) => m.workspaceId === workspaceId);
    if (exact) return exact.roles;
    const wildcard = user.memberships.find((m) => m.workspaceId === "*");
    return wildcard ? wildcard.roles : [];
  }

  authorize(user: User, workspaceId: string, resource: Resource, action: Action): void {
    const roles = this.rolesFor(user, workspaceId);
    if (roles.length === 0) throw new ForbiddenError("Not a member of this workspace");
    if (!hasPermission(roles, resource, action)) {
      throw new ForbiddenError(`Missing permission ${resource}:${action}`);
    }
  }

  can(user: User, workspaceId: string, resource: Resource, action: Action): boolean {
    try {
      this.authorize(user, workspaceId, resource, action);
      return true;
    } catch {
      return false;
    }
  }
}
