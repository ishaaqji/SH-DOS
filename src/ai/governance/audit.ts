import { MemoryStore, type Store } from "../../kernel/store";
import { newId, now } from "../../kernel/ids";
import type { GovernanceAuditRecord, GovernanceAuditEvent } from "./types";

export type GovernanceAuditInput = Omit<GovernanceAuditRecord, "id" | "createdAt" | "updatedAt">;

export class GovernanceAuditStore {
  constructor(private store: Store<GovernanceAuditRecord> = new MemoryStore<GovernanceAuditRecord>()) {}

  record(input: GovernanceAuditInput): GovernanceAuditRecord {
    const record: GovernanceAuditRecord = {
      ...input,
      id: newId("gov"),
      createdAt: now(),
      updatedAt: now(),
    };
    return this.store.insert(record);
  }

  list(workspaceId: string): GovernanceAuditRecord[] {
    return this.store.find((r) => r.workspaceId === workspaceId);
  }

  count(workspaceId: string, event: GovernanceAuditEvent): number {
    return this.list(workspaceId).filter((r) => r.event === event).length;
  }
}
