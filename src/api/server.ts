import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { IdentityService, User, Workspace } from "../identity/identity";
import { ContentService, type ContentInput, type ContentPatch } from "../content/service";
import type { PublishingWorkflow } from "../content/publishing";
import type { MediaService } from "../media/service";
import type { AiGateway } from "../ai/service";
import type { AiChatRequest } from "../ai/types";
import type { AiRouter } from "../ai/router/service";
import type { AiRoutingInput } from "../ai/router/types";
import type { AiGovernance, GovernedExecuteInput } from "../ai/governance/service";
import type { GovernancePolicyPatch } from "../ai/governance/types";
import type { AiDashboardService, AiDashboardQuery } from "../ai/dashboard/service";
import { DomainError } from "../kernel/errors";
import { parsePageQuery } from "../kernel/pagination";
import type { Action, Resource } from "../identity/permissions";
import type { WorkflowStatus } from "../content/types";

type Handler = (ctx: ApiContext) => Promise<unknown> | unknown;

export interface ApiContext {
  req: IncomingMessage;
  res: ServerResponse;
  user: User;
  workspace: Workspace;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
}

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    this.routes.push({ method, parts: path.split("/").filter(Boolean), handler });
  }

  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let matches = true;
      for (let i = 0; i < parts.length; i++) {
        const template = route.parts[i];
        if (template.startsWith(":")) {
          params[template.slice(1)] = decodeURIComponent(parts[i]);
        } else if (template !== parts[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return { handler: route.handler, params };
    }
    return null;
  }
}

export interface ApiDeps {
  identity: IdentityService;
  content: ContentService;
  publishing: PublishingWorkflow;
  media: MediaService;
  ai: AiGateway;
  aiRouter: AiRouter;
  aiGovernance: AiGovernance;
  aiDashboard: AiDashboardService;
  openapi: unknown;
}

const BODY_LIMIT = 1024 * 1024;
const UPLOAD_LIMIT = 20 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new DomainError("PAYLOAD_TOO_LARGE", "Request body too large", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new DomainError("INVALID_JSON", "Request body is not valid JSON", 400));
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > UPLOAD_LIMIT) {
        reject(new DomainError("PAYLOAD_TOO_LARGE", "Upload body too large", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof DomainError) {
    sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    return;
  }
  sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

const PUBLIC_PATHS = new Set([
  "/healthz",
  "/openapi.json",
  "/api/v1/auth/login",
]);

export function createApiServer(deps: ApiDeps): Server {
  const router = new Router();
  registerRoutes(router, deps);

  return createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const query: Record<string, string | undefined> = {};
        url.searchParams.forEach((value, key) => {
          query[key] = value;
        });

        if (url.pathname === "/healthz") {
          sendJson(res, 200, { status: "ok" });
          return;
        }
        if (url.pathname === "/openapi.json") {
          sendJson(res, 200, deps.openapi);
          return;
        }

        if (req.method === "GET" && url.pathname.startsWith("/media/")) {
          const key = decodeURIComponent(url.pathname.slice("/media/".length));
          const found = deps.media
            .list(key.split("/")[0])
            .find((m) => m.url === `/media/${key}`);
          if (!found) {
            sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Media not found" } });
            return;
          }
          const blob = await deps.media.blob(found);
          if (!blob) {
            sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Media not found" } });
            return;
          }
          res.writeHead(200, {
            "content-type": blob.contentType,
            "content-length": blob.data.length,
            "cache-control": "public, max-age=31536000, immutable",
          });
          res.end(blob.data);
          return;
        }

        const isPublic = PUBLIC_PATHS.has(url.pathname);
        const user = isPublic
          ? undefined
          : deps.identity.authenticate(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
        const match = router.match(req.method ?? "GET", url.pathname);
        if (!match) {
          sendJson(res, 404, { error: { code: "NOT_FOUND", message: `No route for ${req.method} ${url.pathname}` } });
          return;
        }

        const workspaceId = match.params.workspaceId;
        const workspace = workspaceId ? deps.identity.getWorkspace(workspaceId) : undefined;
        if (workspaceId && !workspace) {
          sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Workspace not found" } });
          return;
        }

        const isUpload = url.pathname.endsWith("/media/upload") || url.pathname.endsWith("/replace");
        const body = ["POST", "PUT", "PATCH"].includes(req.method ?? "")
          ? isUpload
            ? await readRawBody(req)
            : await readBody(req)
          : undefined;

        const result = await match.handler({
          req,
          res,
          user: user as User,
          workspace: workspace as Workspace,
          params: match.params,
          query,
          body,
        });
        if (!res.writableEnded) {
          sendJson(res, 200, result ?? {});
        }
      } catch (err) {
        sendError(res, err);
      }
    })();
  });
}

function registerRoutes(router: Router, deps: ApiDeps): void {
  const { identity, content } = deps;

  const bodyAs = <T>(ctx: ApiContext): T => (ctx.body ?? {}) as T;
  const perm = (ctx: ApiContext, resource: Resource, action: Action): void => {
    identity.authorize(ctx.user, ctx.workspace.id, resource, action);
  };

  // Auth
  router.add("POST", "/api/v1/auth/login", (ctx) => {
    const b = bodyAs<{ email?: string; password?: string }>(ctx);
    const user = identity.login(b.email ?? "", b.password);
    return {
      token: user.id,
      user: publicUser(user),
      workspaces: identity.workspacesFor(user).map(publicWorkspace),
    };
  });

  router.add("GET", "/api/v1/auth/me", (ctx) => ({
    user: publicUser(ctx.user),
    workspaces: identity.workspacesFor(ctx.user).map(publicWorkspace),
  }));

  router.add("GET", "/api/v1/workspaces", (ctx) =>
    identity.workspacesFor(ctx.user).map(publicWorkspace));

  router.add("POST", "/api/v1/workspaces", (ctx) => {
    const b = bodyAs<{ name: string; slug?: string; baseUrl?: string; defaultLocale?: string }>(ctx);
    return identity.createWorkspace({ ...b, ownerId: ctx.user.id });
  });

  router.add("GET", "/api/v1/workspaces/:workspaceId", (ctx) => ctx.workspace);

  // Languages
  router.add("GET", "/api/v1/workspaces/:workspaceId/languages", (ctx) =>
    contentLanguages(deps).list());
  router.add("POST", "/api/v1/workspaces/:workspaceId/languages", (ctx) => {
    perm(ctx, "language", "create");
    const b = bodyAs<{ code: string; name: string; nativeName?: string; locale?: string }>(ctx);
    return contentLanguages(deps).register(b);
  });

  // Categories
  router.add("GET", "/api/v1/workspaces/:workspaceId/categories", (ctx) =>
    content.listCategories(ctx.workspace.id, ctx.query.type as never));
  router.add("POST", "/api/v1/workspaces/:workspaceId/categories", (ctx) => {
    const b = bodyAs<{ type?: never; name: string; slug?: string; parentId?: string; description?: string }>(ctx);
    return content.createCategory(ctx.user, ctx.workspace.id, b);
  });
  router.add("GET", "/api/v1/workspaces/:workspaceId/categories/:categoryId", (ctx) =>
    content.getCategory(ctx.workspace.id, ctx.params.categoryId));
  router.add("PATCH", "/api/v1/workspaces/:workspaceId/categories/:categoryId", (ctx) =>
    content.updateCategory(ctx.user, ctx.workspace.id, ctx.params.categoryId, bodyAs(ctx)));
  router.add("DELETE", "/api/v1/workspaces/:workspaceId/categories/:categoryId", (ctx) =>
    content.deleteCategory(ctx.user, ctx.workspace.id, ctx.params.categoryId));

  // Tags
  router.add("GET", "/api/v1/workspaces/:workspaceId/tags", (ctx) => content.listTags(ctx.workspace.id));
  router.add("POST", "/api/v1/workspaces/:workspaceId/tags", (ctx) =>
    content.createTag(ctx.user, ctx.workspace.id, bodyAs(ctx)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/tags/:tagId", (ctx) =>
    content.getTag(ctx.workspace.id, ctx.params.tagId));
  router.add("PATCH", "/api/v1/workspaces/:workspaceId/tags/:tagId", (ctx) =>
    content.updateTag(ctx.user, ctx.workspace.id, ctx.params.tagId, bodyAs(ctx)));
  router.add("DELETE", "/api/v1/workspaces/:workspaceId/tags/:tagId", (ctx) =>
    content.deleteTag(ctx.user, ctx.workspace.id, ctx.params.tagId));

  // Authors
  router.add("GET", "/api/v1/workspaces/:workspaceId/authors", (ctx) => content.listAuthors(ctx.workspace.id));
  router.add("POST", "/api/v1/workspaces/:workspaceId/authors", (ctx) =>
    content.createAuthor(ctx.user, ctx.workspace.id, bodyAs(ctx)));

  // Media
  router.add("GET", "/api/v1/workspaces/:workspaceId/media", (ctx) => deps.media.list(ctx.workspace.id));
  router.add("POST", "/api/v1/workspaces/:workspaceId/media", (ctx) =>
    content.createMedia(ctx.user, ctx.workspace.id, bodyAs(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/media/upload", (ctx) =>
    deps.media.upload(ctx.user, ctx.workspace.id, ctx.body as Buffer, {
      filename: ctx.query.filename,
      alt: ctx.query.alt,
      usage: ctx.query.usage as "featured" | "attachment" | undefined,
      contentId: ctx.query.contentId,
      mimeType: ctx.query.mimeType,
    }));
  router.add("GET", "/api/v1/workspaces/:workspaceId/media/:mediaId", (ctx) =>
    deps.media.get(ctx.workspace.id, ctx.params.mediaId));
  router.add("PATCH", "/api/v1/workspaces/:workspaceId/media/:mediaId", (ctx) =>
    deps.media.update(ctx.user, ctx.workspace.id, ctx.params.mediaId, bodyAs<{
      alt?: string;
      usage?: "featured" | "attachment";
      contentId?: string;
    }>(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/media/:mediaId/replace", (ctx) =>
    deps.media.replace(ctx.user, ctx.workspace.id, ctx.params.mediaId, ctx.body as Buffer, {
      filename: ctx.query.filename,
      alt: ctx.query.alt,
      usage: ctx.query.usage as "featured" | "attachment" | undefined,
      contentId: ctx.query.contentId,
      mimeType: ctx.query.mimeType,
    }));
  router.add("DELETE", "/api/v1/workspaces/:workspaceId/media/:mediaId", (ctx) =>
    deps.media.delete(ctx.user, ctx.workspace.id, ctx.params.mediaId));

  // Content
  router.add("POST", "/api/v1/workspaces/:workspaceId/content", (ctx) =>
    content.create(ctx.user, ctx.workspace.id, bodyAs<ContentInput>(ctx)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/content", (ctx) =>
    content.list(ctx.workspace.id, parsePageQuery(ctx.query)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/content/by-slug/:slug", (ctx) =>
    content.getBySlug(ctx.workspace.id, ctx.params.slug, ctx.query.locale));
  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId", (ctx) =>
    content.resolve(ctx.workspace.id, ctx.params.contentId, ctx.query.locale));
  router.add("PATCH", "/api/v1/workspaces/:workspaceId/content/:contentId", (ctx) =>
    content.update(ctx.user, ctx.workspace.id, ctx.params.contentId, bodyAs<ContentPatch>(ctx)));
  router.add("DELETE", "/api/v1/workspaces/:workspaceId/content/:contentId", (ctx) =>
    content.delete(ctx.user, ctx.workspace.id, ctx.params.contentId));

  router.add("POST", "/api/v1/workspaces/:workspaceId/content/:contentId/restore", (ctx) =>
    content.restore(ctx.user, ctx.workspace.id, ctx.params.contentId));
  router.add("POST", "/api/v1/workspaces/:workspaceId/content/:contentId/transition", (ctx) =>
    content.transition(ctx.user, ctx.workspace.id, ctx.params.contentId, bodyAs<{ to: WorkflowStatus }>(ctx).to));
  router.add("POST", "/api/v1/workspaces/:workspaceId/content/:contentId/schedule", (ctx) =>
    content.schedule(ctx.user, ctx.workspace.id, ctx.params.contentId, bodyAs<{ scheduledAt: string }>(ctx).scheduledAt));

  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId/versions", (ctx) =>
    content.versions(ctx.params.contentId));
  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId/versions/:versionNumber", (ctx) =>
    content.getVersion(ctx.params.contentId, Number.parseInt(ctx.params.versionNumber, 10)));

  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId/audit", (ctx) =>
    deps.publishing.audit(ctx.workspace.id, ctx.params.contentId));
  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId/transitions", (ctx) => {
    const c = content.resolve(ctx.workspace.id, ctx.params.contentId).content;
    return deps.publishing.allowedTransitions(c.status);
  });

  router.add("GET", "/api/v1/workspaces/:workspaceId/content/:contentId/translations", (ctx) =>
    content.translations(ctx.workspace.id, ctx.params.contentId));
  router.add("POST", "/api/v1/workspaces/:workspaceId/content/:contentId/translations", (ctx) =>
    content.requestTranslation(ctx.user, ctx.workspace.id, ctx.params.contentId, bodyAs<{ locale: string }>(ctx).locale));
  router.add("POST", "/api/v1/workspaces/:workspaceId/translations/:translationId/review", (ctx) =>
    content.reviewTranslation(ctx.user, ctx.workspace.id, ctx.params.translationId, bodyAs<{ action: "approve" | "request_changes" | "mark_review" }>(ctx).action));

  router.add("POST", "/api/v1/workspaces/:workspaceId/scheduler/run", (ctx) => {
    perm(ctx, "content", "publish");
    return deps.publishing.publishDue();
  });

  // AI Gateway
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/status", (ctx) =>
    deps.ai.status(ctx.user, ctx.workspace.id));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/config", (ctx) =>
    deps.ai.getConfig(ctx.user, ctx.workspace.id));
  router.add("PUT", "/api/v1/workspaces/:workspaceId/ai/config", (ctx) =>
    deps.ai.updateConfig(ctx.user, ctx.workspace.id, bodyAs(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/chat", (ctx) =>
    deps.ai.chat(ctx.user, ctx.workspace.id, bodyAs<AiChatRequest>(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/route", (ctx) =>
    deps.aiRouter.complete(ctx.user, ctx.workspace.id, bodyAs<AiRoutingInput>(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/route/plan", (ctx) =>
    deps.aiRouter.plan(ctx.user, ctx.workspace.id, bodyAs<AiRoutingInput>(ctx)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/route/audit", (ctx) =>
    deps.aiRouter.decisions(ctx.user, ctx.workspace.id));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/usage", (ctx) =>
    deps.ai.usage(ctx.user, ctx.workspace.id));

  // AI Governance
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/governance", (ctx) =>
    deps.aiGovernance.policy(ctx.user, ctx.workspace.id));
  router.add("PUT", "/api/v1/workspaces/:workspaceId/ai/governance", (ctx) =>
    deps.aiGovernance.updatePolicy(ctx.user, ctx.workspace.id, bodyAs<GovernancePolicyPatch>(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/governance/inspect", (ctx) =>
    deps.aiGovernance.inspect(ctx.user, ctx.workspace.id, bodyAs<GovernedExecuteInput>(ctx)));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/governance/execute", (ctx) =>
    deps.aiGovernance.execute(ctx.user, ctx.workspace.id, bodyAs<GovernedExecuteInput>(ctx)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/governance/reviews", (ctx) =>
    deps.aiGovernance.reviews(ctx.user, ctx.workspace.id));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/governance/reviews/pending", (ctx) =>
    deps.aiGovernance.pendingReviews(ctx.user, ctx.workspace.id));
  router.add("POST", "/api/v1/workspaces/:workspaceId/ai/governance/reviews/:reviewId", (ctx) =>
    deps.aiGovernance.review(ctx.user, ctx.workspace.id, ctx.params.reviewId, bodyAs<{ action: "approve" | "reject"; note?: string }>(ctx).action, bodyAs<{ note?: string }>(ctx).note));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/governance/audit", (ctx) =>
    deps.aiGovernance.auditLog(ctx.user, ctx.workspace.id));

  // AI Dashboard
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/dashboard", (ctx) =>
    deps.aiDashboard.overview(ctx.user, ctx.workspace.id, parseAiDashboardQuery(ctx)));
  router.add("GET", "/api/v1/workspaces/:workspaceId/ai/dashboard/audit", (ctx) =>
    deps.aiDashboard.audit(ctx.user, ctx.workspace.id, parseAiDashboardQuery(ctx)));
}

interface LanguageApis {
  list(): unknown;
  register(input: { code: string; name: string; nativeName?: string; locale?: string }): unknown;
}

function contentLanguages(deps: ApiDeps): LanguageApis {
  return {
    list: () => deps.content.listLanguages(),
    register: (input) => deps.content.registerLanguage(input),
  };
}

function parseAiDashboardQuery(ctx: ApiContext): AiDashboardQuery {
  const q: AiDashboardQuery = {};
  const { query } = ctx;
  if (typeof query.from === "string" && query.from) q.from = query.from;
  if (typeof query.to === "string" && query.to) q.to = query.to;
  if (typeof query.event === "string" && query.event) q.event = query.event;
  if (typeof query.provider === "string" && query.provider) q.provider = query.provider;
  if (typeof query.model === "string" && query.model) q.model = query.model;
  if (typeof query.page === "string" && query.page) q.page = Number.parseInt(query.page, 10);
  if (typeof query.pageSize === "string" && query.pageSize)
    q.pageSize = Number.parseInt(query.pageSize, 10);
  return q;
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    memberships: user.memberships,
    active: user.active,
  };
}

function publicWorkspace(workspace: Workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    baseUrl: workspace.baseUrl,
    defaultLocale: workspace.defaultLocale,
  };
}
