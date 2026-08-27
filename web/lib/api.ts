import type {
  LoginResult,
  MeResult,
  Workspace,
  ApiErrorBody,
  PageResult,
  ContentSummary,
  MediaReference,
  HealthStatus,
  Content,
  ContentInput,
  ContentPatch,
  ContentVersion,
  WorkflowAudit,
  ResolvedContent,
  Category,
  Tag,
  Author,
  Language,
  WorkflowStatus,
  TransitionOption,
} from "./types";
import type {
  AiAuditPage,
  AiDashboardOverview,
  AiDashboardQuery,
  AiPublicConfig,
  AiConfigUpdate,
  AiGovernancePolicy,
  AiGovernancePolicyPatch,
  AiReviewRecord,
  AiReviewAction,
  AiChatResponse,
  AiAssistantInput,
} from "./ai";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
  code: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

const isBinary = (value: unknown): value is ArrayBuffer | Uint8Array =>
  typeof ArrayBuffer !== "undefined" &&
  (value instanceof ArrayBuffer || value instanceof Uint8Array);


function toError(status: number, body: ApiErrorBody | undefined): ApiError {
  const code = body?.error?.code ?? "REQUEST_FAILED";
  const message = body?.error?.message ?? `Request failed with status ${status}`;
  return new ApiError(status, code, message);
}

export function createApiClient(opts: ApiClientOptions) {
  const request = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    const headers = new Headers();
    const binary = init.body !== undefined && isBinary(init.body);
    if (!binary) headers.set("content-type", "application/json");
    const token = init.token ?? opts.getToken?.() ?? null;
    if (token) headers.set("authorization", `Bearer ${token}`);

    const requestBody = binary ? (init.body as BodyInit) : init.body === undefined ? undefined : JSON.stringify(init.body);

    const res = await fetch(`${opts.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: requestBody as BodyInit | undefined,
    });

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as T & ApiErrorBody) : undefined;
    if (!res.ok) throw toError(res.status, parsed);
    return parsed as T;
  };

  return {
    login(email: string, password: string): Promise<LoginResult> {
      return request<LoginResult>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });
    },
    me(): Promise<MeResult> {
      return request<MeResult>("/api/v1/auth/me");
    },
    listWorkspaces(): Promise<Workspace[]> {
      return request<Workspace[]>("/api/v1/workspaces");
    },
    health(): Promise<HealthStatus> {
      return request<HealthStatus>("/healthz");
    },
    listContent(
      workspaceId: string,
      query: {
        page?: number;
        pageSize?: number;
        sort?: string;
        search?: string;
        type?: string;
        status?: string;
        locale?: string;
        category?: string;
        tag?: string;
        author?: string;
      } = {},
    ): Promise<PageResult<Content>> {
      const params = new URLSearchParams();
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
      if (query.sort) params.set("sort", query.sort);
      if (query.search) params.set("search", query.search);
      if (query.type) params.set("type", query.type);
      if (query.status) params.set("status", query.status);
      if (query.locale) params.set("locale", query.locale);
      if (query.category) params.set("category", query.category);
      if (query.tag) params.set("tag", query.tag);
      if (query.author) params.set("author", query.author);
      const qs = params.toString();
      return request<PageResult<Content>>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content${qs ? `?${qs}` : ""}`,
      );
    },
    getContent(workspaceId: string, contentId: string): Promise<ResolvedContent> {
      return request<ResolvedContent>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}`,
      );
    },
    createContent(workspaceId: string, input: ContentInput): Promise<Content> {
      return request<Content>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content`, {
        method: "POST",
        body: input,
      });
    },
    updateContent(
      workspaceId: string,
      contentId: string,
      patch: ContentPatch,
    ): Promise<Content> {
      return request<Content>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}`,
        { method: "PATCH", body: patch },
      );
    },
    deleteContent(workspaceId: string, contentId: string): Promise<Content> {
      return request<Content>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}`,
        { method: "DELETE" },
      );
    },
    transitionContent(
      workspaceId: string,
      contentId: string,
      to: WorkflowStatus,
    ): Promise<Content> {
      return request<Content>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}/transition`,
        { method: "POST", body: { to } },
      );
    },
    scheduleContent(workspaceId: string, contentId: string, scheduledAt: string): Promise<Content> {
      return request<Content>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}/schedule`,
        { method: "POST", body: { scheduledAt } },
      );
    },
    contentVersions(workspaceId: string, contentId: string): Promise<ContentVersion[]> {
      return request<ContentVersion[]>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}/versions`,
      );
    },
    contentAudit(workspaceId: string, contentId: string): Promise<WorkflowAudit[]> {
      return request<WorkflowAudit[]>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}/audit`,
      );
    },
    allowedTransitions(workspaceId: string, contentId: string): Promise<TransitionOption[]> {
      return request<TransitionOption[]>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/content/${encodeURIComponent(contentId)}/transitions`,
      );
    },
    runScheduler(workspaceId: string): Promise<Content[]> {
      return request<Content[]>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/scheduler/run`,
        { method: "POST" },
      );
    },
    listCategories(workspaceId: string): Promise<Category[]> {
      return request<Category[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories`);
    },
    createCategory(
      workspaceId: string,
      input: { type?: Content["type"]; name: string; slug?: string; parentId?: string; description?: string },
    ): Promise<Category> {
      return request<Category>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories`, {
        method: "POST",
        body: input,
      });
    },
    deleteCategory(workspaceId: string, categoryId: string): Promise<Category> {
      return request<Category>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/categories/${encodeURIComponent(categoryId)}`,
        { method: "DELETE" },
      );
    },
    listTags(workspaceId: string): Promise<Tag[]> {
      return request<Tag[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tags`);
    },
    createTag(workspaceId: string, input: { name: string; slug?: string }): Promise<Tag> {
      return request<Tag>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tags`, {
        method: "POST",
        body: input,
      });
    },
    deleteTag(workspaceId: string, tagId: string): Promise<Tag> {
      return request<Tag>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/tags/${encodeURIComponent(tagId)}`,
        { method: "DELETE" },
      );
    },
    listAuthors(workspaceId: string): Promise<Author[]> {
      return request<Author[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/authors`);
    },
    listLanguages(workspaceId: string): Promise<Language[]> {
      return request<Language[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/languages`);
    },
    aiDashboard(
      workspaceId: string,
      query: AiDashboardQuery = {},
    ): Promise<AiDashboardOverview> {
      const params = new URLSearchParams();
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.event) params.set("event", query.event);
      if (query.provider) params.set("provider", query.provider);
      if (query.model) params.set("model", query.model);
      const qs = params.toString();
      return request<AiDashboardOverview>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/dashboard${qs ? `?${qs}` : ""}`,
      );
    },
    aiAudit(workspaceId: string, query: AiDashboardQuery = {}): Promise<AiAuditPage> {
      const params = new URLSearchParams();
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.event) params.set("event", query.event);
      if (query.provider) params.set("provider", query.provider);
      if (query.model) params.set("model", query.model);
      const qs = params.toString();
      return request<AiAuditPage>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/dashboard/audit${qs ? `?${qs}` : ""}`,
      );
    },
    getAiConfig(workspaceId: string): Promise<AiPublicConfig> {
      return request<AiPublicConfig>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/config`,
      );
    },
    updateAiConfig(workspaceId: string, input: AiConfigUpdate): Promise<AiPublicConfig> {
      return request<AiPublicConfig>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/config`,
        { method: "PUT", body: input },
      );
    },
    getGovernancePolicy(workspaceId: string): Promise<AiGovernancePolicy> {
      return request<AiGovernancePolicy>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/governance`,
      );
    },
    updateGovernancePolicy(
      workspaceId: string,
      patch: AiGovernancePolicyPatch,
    ): Promise<AiGovernancePolicy> {
      return request<AiGovernancePolicy>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/governance`,
        { method: "PUT", body: patch },
      );
    },
    listPendingAiReviews(workspaceId: string): Promise<AiReviewRecord[]> {
      return request<AiReviewRecord[]>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/governance/reviews/pending`,
      );
    },
    reviewAiReview(
      workspaceId: string,
      reviewId: string,
      action: AiReviewAction,
      note?: string,
    ): Promise<AiReviewRecord> {
      return request<AiReviewRecord>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/governance/reviews/${encodeURIComponent(reviewId)}`,
        { method: "POST", body: { action, ...(note ? { note } : {}) } },
      );
    },
    governedAiExecute(workspaceId: string, input: AiAssistantInput): Promise<AiChatResponse> {
      return request<AiChatResponse>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/ai/governance/execute`,
        { method: "POST", body: input },
      );
    },
    listMedia(workspaceId: string): Promise<MediaReference[]> {
      return request<MediaReference[]>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media`);
    },
    getMedia(workspaceId: string, mediaId: string): Promise<MediaReference> {
      return request<MediaReference>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(mediaId)}`,
      );
    },
    updateMedia(
      workspaceId: string,
      mediaId: string,
      patch: { alt?: string; usage?: "featured" | "attachment"; contentId?: string },
    ): Promise<MediaReference> {
      return request<MediaReference>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(mediaId)}`,
        { method: "PATCH", body: patch },
      );
    },
    deleteMedia(workspaceId: string, mediaId: string): Promise<MediaReference> {
      return request<MediaReference>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(mediaId)}`,
        { method: "DELETE" },
      );
    },
    uploadMedia(
      workspaceId: string,
      buffer: ArrayBuffer | Uint8Array,
      input: { filename?: string; alt?: string; usage?: "featured" | "attachment"; contentId?: string; mimeType?: string } = {},
    ): Promise<MediaReference> {
      const params = new URLSearchParams();
      if (input.filename) params.set("filename", input.filename);
      if (input.alt) params.set("alt", input.alt);
      if (input.usage) params.set("usage", input.usage);
      if (input.contentId) params.set("contentId", input.contentId);
      if (input.mimeType) params.set("mimeType", input.mimeType);
      const qs = params.toString();
      return request<MediaReference>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media/upload${qs ? `?${qs}` : ""}`,
        { method: "POST", body: buffer },
      );
    },
    replaceMedia(
      workspaceId: string,
      mediaId: string,
      buffer: ArrayBuffer | Uint8Array,
      input: { filename?: string; alt?: string; usage?: "featured" | "attachment"; contentId?: string; mimeType?: string } = {},
    ): Promise<MediaReference> {
      const params = new URLSearchParams();
      if (input.filename) params.set("filename", input.filename);
      if (input.alt) params.set("alt", input.alt);
      if (input.usage) params.set("usage", input.usage);
      if (input.contentId) params.set("contentId", input.contentId);
      if (input.mimeType) params.set("mimeType", input.mimeType);
      const qs = params.toString();
      return request<MediaReference>(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(mediaId)}/replace${qs ? `?${qs}` : ""}`,
        { method: "POST", body: buffer },
      );
    },
    request,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
