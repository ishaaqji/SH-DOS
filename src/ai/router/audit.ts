import { MemoryStore, type Store } from "../../kernel/store";
import { newId, now } from "../../kernel/ids";
import type { RoutingDecision } from "./types";

export class RoutingAuditStore {
  constructor(private store: Store<RoutingDecision> = new MemoryStore<RoutingDecision>()) {}

  record(input: Omit<RoutingDecision, "id" | "createdAt" | "updatedAt">): RoutingDecision {
    const decision: RoutingDecision = {
      ...input,
      id: newId("rte"),
      createdAt: now(),
      updatedAt: now(),
    };
    return this.store.insert(decision);
  }

  list(workspaceId: string): RoutingDecision[] {
    return this.store.find((d) => d.workspaceId === workspaceId);
  }
}
