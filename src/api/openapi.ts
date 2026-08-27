export function buildOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "SH-DOS M3 Content API",
      version: "0.3.0",
      description:
        "Multilingual Content Platform: content lifecycle, workflow, versioning, translations, taxonomy, media and scheduling.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "Auth", description: "Authentication and session" },
      { name: "Workspaces", description: "Workspace management" },
      { name: "Content", description: "Content CRUD, workflow, scheduling, versions" },
      { name: "Translations", description: "Multilingual translation relationships and review" },
      { name: "Taxonomy", description: "Categories and tags" },
      { name: "Authors", description: "Author records" },
      { name: "Media", description: "Featured images and attachments" },
      { name: "Languages", description: "Language registry and locale fallback" },
    ],
    security: [{ BearerAuth: [] }],
    paths: {
      "/auth/login": {
        post: {
          tags: ["Auth"], summary: "Login with email and password", operationId: "login",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" }, workspaces: { type: "array", items: { $ref: "#/components/schemas/Workspace" } } } } } } },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"], summary: "Current session (user + workspaces)", operationId: "me",
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" }, workspaces: { type: "array", items: { $ref: "#/components/schemas/Workspace" } } } } } } },
          },
        },
      },
      "/workspaces": {
        get: {
          tags: ["Workspaces"], summary: "List workspaces", operationId: "listWorkspaces",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Workspace" } } } } } },
        },
        post: {
          tags: ["Workspaces"], summary: "Create workspace", operationId: "createWorkspace",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, slug: { type: "string" }, baseUrl: { type: "string" }, defaultLocale: { type: "string" } } } } } },
          responses: { "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Workspace" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content": {
        get: {
          tags: ["Content"], summary: "List content with pagination, filtering and search",
          operationId: "listContent",
          parameters: [
            { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
            { name: "sort", in: "query", schema: { type: "string", example: "-updatedAt" } },
            { name: "type", in: "query", schema: { type: "string", enum: ["article", "news", "video", "page", "business_listing", "knowledge_base", "temple", "course", "event"] } },
            { name: "status", in: "query", schema: { type: "string", enum: ["draft", "review", "approved", "published", "archived"] } },
            { name: "locale", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "tag", in: "query", schema: { type: "string" } },
            { name: "author", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Page" } } } } },
        },
        post: {
          tags: ["Content"], summary: "Create content (draft)", operationId: "createContent",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ContentInput" } } } },
          responses: { "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}": {
        get: {
          tags: ["Content"], summary: "Get content with locale fallback", operationId: "getContent",
          parameters: [
            { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
            { name: "contentId", in: "path", required: true, schema: { type: "string" } },
            { name: "locale", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ResolvedContent" } } } } },
        },
        patch: {
          tags: ["Content"], summary: "Update content (creates a version)", operationId: "updateContent",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ContentPatch" } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
        delete: {
          tags: ["Content"], summary: "Soft delete content", operationId: "deleteContent",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/by-slug/{slug}": {
        get: {
          tags: ["Content"], summary: "Resolve content by slug with locale fallback", operationId: "getContentBySlug",
          parameters: [
            { name: "workspaceId", in: "path", required: true, schema: { type: "string" } },
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "locale", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ResolvedContent" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}/transition": {
        post: {
          tags: ["Content"], summary: "Transition workflow status", operationId: "transitionContent",
          parameters: [{ name: "workspaceId", in: "path", required: true, schema: { type: "string" } }, { name: "contentId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["to"], properties: { to: { type: "string", enum: ["draft", "review", "approved", "published", "archived"] } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}/schedule": {
        post: {
          tags: ["Content"], summary: "Schedule publishing", operationId: "scheduleContent",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["scheduledAt"], properties: { scheduledAt: { type: "string", format: "date-time" } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}/versions": {
        get: {
          tags: ["Content"], summary: "List version history", operationId: "listVersions",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ContentVersion" } } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}/versions/{versionNumber}": {
        get: {
          tags: ["Content"], summary: "Get a specific version", operationId: "getVersion",
          parameters: [{ name: "versionNumber", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ContentVersion" } } } } },
        },
      },
      "/workspaces/{workspaceId}/content/{contentId}/translations": {
        get: {
          tags: ["Translations"], summary: "List translations for content", operationId: "listTranslations",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Translation" } } } } } },
        },
        post: {
          tags: ["Translations"], summary: "Request a translation (auto hook + review)", operationId: "requestTranslation",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["locale"], properties: { locale: { type: "string" } } } } } },
          responses: { "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Translation" } } } } },
        },
      },
      "/workspaces/{workspaceId}/translations/{translationId}/review": {
        post: {
          tags: ["Translations"], summary: "Human review of a translation", operationId: "reviewTranslation",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["mark_review", "approve", "request_changes"] } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Translation" } } } } },
        },
      },
      "/workspaces/{workspaceId}/categories": {
        get: { tags: ["Taxonomy"], summary: "List categories", responses: { "200": { description: "OK" } } },
        post: { tags: ["Taxonomy"], summary: "Create category", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/tags": {
        get: { tags: ["Taxonomy"], summary: "List tags", responses: { "200": { description: "OK" } } },
        post: { tags: ["Taxonomy"], summary: "Create tag", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/languages": {
        get: { tags: ["Languages"], summary: "List registered languages", responses: { "200": { description: "OK" } } },
        post: { tags: ["Languages"], summary: "Register a language", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/authors": {
        get: { tags: ["Authors"], summary: "List authors", responses: { "200": { description: "OK" } } },
        post: { tags: ["Authors"], summary: "Create author", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/media": {
        get: { tags: ["Media"], summary: "List media references", responses: { "200": { description: "OK" } } },
        post: { tags: ["Media"], summary: "Create media reference", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/media/upload": {
        post: { tags: ["Media"], summary: "Upload media bytes", responses: { "201": { description: "Created" } } },
      },
      "/workspaces/{workspaceId}/media/{mediaId}": {
        get: { tags: ["Media"], summary: "Get media reference", responses: { "200": { description: "OK" } } },
        patch: { tags: ["Media"], summary: "Update media metadata", responses: { "200": { description: "OK" } } },
        delete: { tags: ["Media"], summary: "Delete media reference", responses: { "200": { description: "OK" } } },
      },
      "/workspaces/{workspaceId}/media/{mediaId}/replace": {
        post: { tags: ["Media"], summary: "Replace media bytes", responses: { "200": { description: "OK" } } },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", description: "Bearer token (user id)" },
      },
      schemas: {
        User: { type: "object", properties: { id: { type: "string" }, email: { type: "string" }, name: { type: "string" }, memberships: { type: "array", items: { type: "object", properties: { workspaceId: { type: "string" }, roles: { type: "array", items: { type: "string" } } } } }, active: { type: "boolean" } } },
        Workspace: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, baseUrl: { type: "string" }, defaultLocale: { type: "string" } } },
        ContentInput: { type: "object", required: ["type", "title"], properties: { type: { type: "string" }, title: { type: "string" }, body: { type: "string" }, excerpt: { type: "string" }, slug: { type: "string" }, authorId: { type: "string" }, categoryIds: { type: "array", items: { type: "string" } }, tagIds: { type: "array", items: { type: "string" } }, featuredImageId: { type: "string" }, attachmentIds: { type: "array", items: { type: "string" } }, locale: { type: "string" }, scheduledAt: { type: "string" } } },
        ContentPatch: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, excerpt: { type: "string" }, slug: { type: "string" }, seo: { $ref: "#/components/schemas/SeoMetadata" }, scheduledAt: { type: "string" }, changeSummary: { type: "string" } } },
        SeoMetadata: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, robots: { type: "string" }, ogImage: { type: "string" }, canonicalUrl: { type: "string" } } },
        Content: { type: "object", properties: { id: { type: "string" }, workspaceId: { type: "string" }, type: { type: "string" }, title: { type: "string" }, slug: { type: "string" }, body: { type: "string" }, excerpt: { type: "string" }, status: { type: "string" }, locale: { type: "string" }, canonicalUrl: { type: "string" }, publishedAt: { type: "string" }, scheduledAt: { type: "string" }, seo: { $ref: "#/components/schemas/SeoMetadata" } } },
        ResolvedContent: { type: "object", properties: { content: { $ref: "#/components/schemas/Content" }, resolvedLocale: { type: "string" }, viaTranslation: { type: "boolean" }, fallback: { type: "boolean" } } },
        ContentVersion: { type: "object", properties: { id: { type: "string" }, contentId: { type: "string" }, versionNumber: { type: "integer" }, title: { type: "string" }, status: { type: "string" }, changeSummary: { type: "string" }, createdAt: { type: "string" } } },
        Translation: { type: "object", properties: { id: { type: "string" }, translationGroupId: { type: "string" }, sourceContentId: { type: "string" }, targetContentId: { type: "string" }, locale: { type: "string" }, status: { type: "string" }, reviewedAt: { type: "string" }, reviewedBy: { type: "string" } } },
        Page: { type: "object", properties: { items: { type: "array" }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
      },
    },
  };
}
