import type { ContentType, WorkflowStatus } from "./types";

export const CONTENT_TYPES: ContentType[] = [
  "article",
  "news",
  "video",
  "page",
  "business_listing",
  "knowledge_base",
  "temple",
  "course",
  "event",
];

export const STATUS_ORDER: WorkflowStatus[] = [
  "draft",
  "review",
  "approved",
  "published",
  "archived",
];

export const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

const TYPE_LABELS: Record<ContentType, string> = {
  article: "Article",
  news: "News",
  video: "Video",
  page: "Page",
  business_listing: "Business listing",
  knowledge_base: "Knowledge base",
  temple: "Temple",
  course: "Course",
  event: "Event",
};

export function contentTypeLabel(type: string): string {
  return TYPE_LABELS[type as ContentType] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as WorkflowStatus] ?? status;
}

export function statusVariant(
  status: string,
): "success" | "warning" | "neutral" | "primary" | "danger" {
  switch (status) {
    case "published":
      return "success";
    case "draft":
      return "neutral";
    case "approved":
      return "primary";
    case "review":
      return "warning";
    case "archived":
      return "danger";
    default:
      return "neutral";
  }
}
