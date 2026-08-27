export interface Membership {
  workspaceId: string;
  roles: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  memberships: Membership[];
  active: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  baseUrl?: string;
  defaultLocale: string;
}

export interface LoginResult {
  token: string;
  user: User;
  workspaces: Workspace[];
}

export interface MeResult {
  user: User;
  workspaces: Workspace[];
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ContentType =
  | "article"
  | "news"
  | "video"
  | "page"
  | "business_listing"
  | "knowledge_base"
  | "temple"
  | "course"
  | "event";

export type WorkflowStatus = "draft" | "review" | "approved" | "published" | "archived";

export interface ContentSummary {
  id: string;
  workspaceId: string;
  type: ContentType;
  title: string;
  slug: string;
  status: WorkflowStatus;
  locale: string;
  updatedAt: string;
  publishedAt?: string;
  scheduledAt?: string;
}

export interface MediaReference {
  id: string;
  workspaceId: string;
  kind: "image" | "file" | "video" | "audio";
  url: string;
  alt?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  contentId?: string;
  usage: "featured" | "attachment";
  createdAt?: string;
  updatedAt?: string;
}

export interface HealthStatus {
  status: string;
}

export interface Content extends ContentSummary {
  type: ContentType;
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  status: WorkflowStatus;
  authorId?: string;
  categoryIds: string[];
  tagIds: string[];
  featuredImageId?: string;
  attachmentIds: string[];
  locale: string;
  seo: Record<string, unknown>;
  canonicalUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: string;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  versionNumber: number;
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  status: WorkflowStatus;
  changeSummary?: string;
  changedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAudit {
  id: string;
  workspaceId: string;
  contentId: string;
  from?: WorkflowStatus;
  to: WorkflowStatus;
  actorId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransitionOption {
  from: WorkflowStatus;
  to: WorkflowStatus;
  action: string;
  label: string;
}

export interface ResolvedContent {
  content: Content;
  resolvedLocale: string;
  viaTranslation: boolean;
  fallback: boolean;
}

export interface ContentInput {
  type: ContentType;
  title: string;
  body?: string;
  excerpt?: string;
  slug?: string;
  authorId?: string;
  categoryIds?: string[];
  tagIds?: string[];
  locale?: string;
  seo?: Record<string, unknown>;
  canonicalUrl?: string;
  scheduledAt?: string;
}

export interface ContentPatch {
  title?: string;
  body?: string;
  excerpt?: string;
  slug?: string;
  authorId?: string;
  categoryIds?: string[];
  tagIds?: string[];
  seo?: Record<string, unknown>;
  canonicalUrl?: string;
  scheduledAt?: string;
  changeSummary?: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  type?: ContentType;
  name: string;
  slug: string;
  parentId?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Author {
  id: string;
  workspaceId: string;
  name: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface Language {
  id: string;
  code: string;
  name: string;
  nativeName: string;
  locale: string;
  isDefault: boolean;
  isActive: boolean;
}
