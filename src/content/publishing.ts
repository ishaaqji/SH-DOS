import type { EventBus } from "../kernel/events";
import { type Store, type Storable } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import { TRANSITIONS } from "./workflow";
import type { ContentService } from "./service";
import type { Content, WorkflowStatus } from "./types";

export interface WorkflowAudit extends Storable {
  workspaceId: string;
  contentId: string;
  from?: WorkflowStatus;
  to: WorkflowStatus;
  actorId?: string;
  note?: string;
}

export interface PublishingWorkflowDeps {
  bus: EventBus;
  audits: Store<WorkflowAudit>;
  content: ContentService;
}

export class PublishingWorkflow {
  private lastStatus = new Map<string, WorkflowStatus>();

  constructor(private deps: PublishingWorkflowDeps) {
    deps.bus.on("content.created", (e) => this.record(e.payload?.content as Content));
    deps.bus.on("content.status_changed", (e) => this.record(e.payload?.content as Content));
    deps.bus.on("content.scheduled", (e) =>
      this.record(
        e.payload?.content as Content,
        `Scheduled for ${(e.payload?.content as Content)?.scheduledAt ?? "?"}`,
      ));
    deps.bus.on("content.published", (e) => {
      const content = e.payload?.content as Content;
      if (!content || !content.scheduledAt) return;
      if (this.lastRecorded(content.id, "published")) return;
      this.record(content, "Published (scheduled)");
    });
    deps.bus.on("content.restored", (e) => this.record(e.payload?.content as Content, "Restored"));
  }

  private lastAudit(contentId: string): WorkflowAudit | undefined {
    const entries = this.deps.audits.find((a) => a.contentId === contentId);
    return entries.length > 0 ? entries[entries.length - 1] : undefined;
  }

  private lastRecorded(contentId: string, to: WorkflowStatus, withinMs = 50): boolean {
    const last = this.lastAudit(contentId);
    if (!last || last.to !== to) return false;
    return Date.now() - Date.parse(last.createdAt) <= withinMs;
  }

  private record(content: Content | undefined, note?: string): void {
    if (!content) return;
    const to = content.status;
    const from = this.lastStatus.get(content.id);
    this.lastStatus.set(content.id, to);
    this.deps.audits.insert({
      id: newId("aud"),
      workspaceId: content.workspaceId,
      contentId: content.id,
      from,
      to,
      actorId: content.updatedBy,
      note,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  audit(workspaceId: string, contentId: string): WorkflowAudit[] {
    return this.deps.audits
      .find((a) => a.workspaceId === workspaceId && a.contentId === contentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  allowedTransitions(from: WorkflowStatus): WorkflowStatus[] {
    return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
  }

  publishDue(at?: Date): Content[] {
    return this.deps.content.runScheduler(at);
  }
}
