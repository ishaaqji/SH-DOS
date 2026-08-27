import { MemoryStore, type Store } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import type { UsageRecord } from "./types";

export interface UsageSummary {
  requests: number;
  okRequests: number;
  failedRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  avgLatencyMs?: number;
}

export type UsageRecordInput = Omit<UsageRecord, "id" | "createdAt" | "updatedAt">;

export class UsageMeter {
  constructor(private store: Store<UsageRecord> = new MemoryStore<UsageRecord>()) {}

  record(input: UsageRecordInput): UsageRecord {
    const record: UsageRecord = {
      ...input,
      id: newId("use"),
      createdAt: now(),
      updatedAt: now(),
    };
    return this.store.insert(record);
  }

  list(workspaceId: string): UsageRecord[] {
    return this.store.find((r) => r.workspaceId === workspaceId);
  }

  todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  today(workspaceId: string): UsageRecord[] {
    const key = this.todayKey();
    return this.list(workspaceId).filter((r) => r.createdAt.slice(0, 10) === key);
  }

  summary(workspaceId: string, records?: UsageRecord[]): UsageSummary {
    const list = records ?? this.list(workspaceId);
    let latencySum = 0;
    let latencyCount = 0;
    const base = list.reduce<UsageSummary>(
      (acc, r) => {
        acc.requests += 1;
        if (r.ok) acc.okRequests += 1;
        else acc.failedRequests += 1;
        acc.promptTokens += r.promptTokens;
        acc.completionTokens += r.completionTokens;
        acc.totalTokens += r.totalTokens;
        acc.cost += r.cost;
        if (r.latencyMs !== undefined) {
          latencySum += r.latencyMs;
          latencyCount += 1;
        }
        return acc;
      },
      {
        requests: 0,
        okRequests: 0,
        failedRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
      },
    );
    if (latencyCount > 0) base.avgLatencyMs = Math.round(latencySum / latencyCount);
    return base;
  }
}
