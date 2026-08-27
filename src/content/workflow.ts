import type { Action } from "../identity/permissions";
import type { WorkflowStatus } from "./types";

export interface Transition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  action: Action;
  label: string;
}

export const WORKFLOW_ORDER: WorkflowStatus[] = [
  "draft",
  "review",
  "approved",
  "published",
  "archived",
];

export const TRANSITIONS: Transition[] = [
  { from: "draft", to: "review", action: "update", label: "submit_for_review" },
  { from: "review", to: "approved", action: "review", label: "approve" },
  { from: "review", to: "draft", action: "update", label: "request_changes" },
  { from: "approved", to: "published", action: "publish", label: "publish" },
  { from: "approved", to: "draft", action: "update", label: "unapprove" },
  { from: "published", to: "draft", action: "update", label: "unpublish" },
  { from: "published", to: "archived", action: "archive", label: "archive" },
  { from: "archived", to: "draft", action: "update", label: "restore" },
];

export function findTransition(from: WorkflowStatus, to: WorkflowStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function nextStatuses(from: WorkflowStatus): WorkflowStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}
