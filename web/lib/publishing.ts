import type { TransitionOption, WorkflowStatus } from "./types";

export const WORKFLOW_STEPS: WorkflowStatus[] = [
  "draft",
  "review",
  "approved",
  "published",
];

export const QUEUE_TABS: Array<{ value: WorkflowStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
];

export const TRANSITION_LABELS: Record<string, string> = {
  submit_for_review: "Submit for review",
  approve: "Approve",
  request_changes: "Request changes",
  publish: "Publish",
  unapprove: "Send back to draft",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore",
};

export function transitionLabel(label: string): string {
  return TRANSITION_LABELS[label] ?? label.replaceAll("_", " ");
}

export interface WorkflowPermission {
  canSubmitForReview: boolean;
  canReview: boolean;
  canPublish: boolean;
  canSchedule: boolean;
}

const REVIEW_ACTIONS = new Set(["approve"]);
const PUBLISH_ACTIONS = new Set(["publish", "archive"]);
const MANAGE_ACTIONS = new Set([
  "submit_for_review",
  "request_changes",
  "unapprove",
  "unpublish",
  "restore",
]);

export function canSubmitForReview(roles: string[]): boolean {
  return roles.some((role) => ["owner", "admin", "editor", "author"].includes(role));
}

export function canReview(roles: string[]): boolean {
  return roles.some((role) => ["owner", "admin", "editor", "reviewer"].includes(role));
}

export function canPublish(roles: string[]): boolean {
  return roles.some((role) => ["owner", "admin", "editor"].includes(role));
}

export function canSchedule(roles: string[]): boolean {
  return roles.some((role) => ["owner", "admin", "editor", "author"].includes(role));
}

export function canRunAction(permissions: WorkflowPermission, label: string): boolean {
  if (REVIEW_ACTIONS.has(label)) return permissions.canReview;
  if (PUBLISH_ACTIONS.has(label)) return permissions.canPublish;
  if (MANAGE_ACTIONS.has(label)) return permissions.canSubmitForReview;
  return false;
}

export function nextStatusFor(transition: TransitionOption): WorkflowStatus {
  return transition.to;
}

export function isScheduled(content: {
  status: WorkflowStatus;
  scheduledAt?: string;
}): boolean {
  return Boolean(content.scheduledAt);
}
