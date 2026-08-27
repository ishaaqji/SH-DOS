import type { Storable } from "../kernel/store";

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

export interface Language extends Storable {
  code: string;
  name: string;
  nativeName: string;
  locale: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface SeoMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  robots?: string;
  ogImage?: string;
  canonicalUrl?: string;
  structuredData?: Record<string, unknown>;
}

export interface Content extends Storable {
  workspaceId: string;
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
  translationGroupId?: string;
  sourceContentId?: string;
  seo: SeoMetadata;
  canonicalUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ContentVersion extends Storable {
  contentId: string;
  versionNumber: number;
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  status: WorkflowStatus;
  seo: SeoMetadata;
  changeSummary?: string;
  changedBy?: string;
}

export interface Category extends Storable {
  workspaceId: string;
  type?: ContentType;
  name: string;
  slug: string;
  parentId?: string;
  description?: string;
}

export interface Tag extends Storable {
  workspaceId: string;
  name: string;
  slug: string;
}

export interface Author extends Storable {
  workspaceId: string;
  name: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
}

export type MediaKind = "image" | "file" | "video" | "audio";

export interface MediaReference extends Storable {
  workspaceId: string;
  kind: MediaKind;
  url: string;
  alt?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  contentId?: string;
  usage: "featured" | "attachment";
}

export type TranslationStatus = "auto" | "needs_review" | "in_review" | "approved";

export interface Translation extends Storable {
  workspaceId: string;
  translationGroupId: string;
  sourceContentId: string;
  targetContentId: string;
  locale: string;
  status: TranslationStatus;
  reviewedAt?: string;
  reviewedBy?: string;
}
