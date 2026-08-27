import { MemoryStore, type Store } from "../../kernel/store";
import { newId, now } from "../../kernel/ids";
import { NotFoundError } from "../../kernel/errors";
import type { AiMessage } from "../types";
import type { ReviewRecord, ReviewStatus } from "./types";

export interface CreateReviewInput {
  workspaceId: string;
  actorId: string;
  summary: { messages?: AiMessage[]; output?: string };
  findings: ReviewRecord["findings"];
}

export class HumanReviewStore {
  constructor(private store: Store<ReviewRecord> = new MemoryStore<ReviewRecord>()) {}

  create(input: CreateReviewInput): ReviewRecord {
    const record: ReviewRecord = {
      ...input,
      id: newId("rvw"),
      status: "pending",
      createdAt: now(),
      updatedAt: now(),
    };
    return this.store.insert(record);
  }

  get(reviewId: string): ReviewRecord {
    const record = this.store.get(reviewId);
    if (!record) throw new NotFoundError(`Review ${reviewId} not found`);
    return record;
  }

  list(workspaceId: string): ReviewRecord[] {
    return this.store.find((r) => r.workspaceId === workspaceId);
  }

  listPending(workspaceId: string): ReviewRecord[] {
    return this.list(workspaceId).filter((r) => r.status === "pending");
  }

  transition(reviewId: string, status: ReviewStatus, reviewedBy: string, note?: string): ReviewRecord {
    const record = this.get(reviewId);
    return this.store.update(reviewId, {
      status,
      reviewedBy,
      reviewedAt: now(),
      note,
    });
  }
}
