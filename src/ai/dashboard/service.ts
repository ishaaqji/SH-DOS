import type { IdentityService, User } from "../../identity/identity";
import type { AiConfigStore } from "../config";
import type { UsageMeter } from "../metering";
import type { GovernanceAuditStore } from "../governance/audit";
import type { HumanReviewStore } from "../governance/human-review";
import type { GovernanceAuditEvent } from "../governance/types";
import type { QuotaLimits, UsageRecord } from "../types";
import { paginate, type PageResult } from "../../kernel/pagination";

export interface AiDashboardQuery {
  from?: string;
  to?: string;
  event?: string;
  provider?: string;
  model?: string;
  page?: number;
  pageSize?: number;
}

export interface DashboardByProvider {
  providerId: string;
  requests: number;
  tokens: number;
  cost: number;
  avgLatencyMs: number | null;
}

export interface DashboardByModel {
  providerId: string;
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface DashboardByDay {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface DashboardUsage {
  summary: {
    requests: number;
    okRequests: number;
    failedRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    avgLatencyMs: number | null;
  };
  byDay: DashboardByDay[];
  byProvider: DashboardByProvider[];
  byModel: DashboardByModel[];
}

export interface DashboardQuota {
  limits: QuotaLimits;
  used: { requests: number; tokens: number; cost: number };
  remaining: { requests?: number; tokens?: number; cost?: number };
}

export interface DashboardGovernance {
  counts: Record<GovernanceAuditEvent, number>;
  piiRedactions: number;
  moderation: {
    blocked: number;
    flagged: number;
    byCategory: Record<string, number>;
  };
}

export interface DashboardReviews {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface AiDashboardOverview {
  usage: DashboardUsage;
  quota: DashboardQuota;
  governance: DashboardGovernance;
  reviews: DashboardReviews;
}

export type AiAuditEventSource = "governance" | "usage";

export interface AiAuditEvent {
  id: string;
  createdAt: string;
  source: AiAuditEventSource;
  event: string;
  actorId: string;
  providerId?: string;
  model?: string;
  detail?: string;
}

export interface AiDashboardDeps {
  identity: IdentityService;
  config: AiConfigStore;
  meter: UsageMeter;
  governanceAudit: GovernanceAuditStore;
  reviews: HumanReviewStore;
}

const MODERATION_RE = /matched\s+(\w+)\s+policy/i;

function inRange(createdAt: string, from?: string, to?: string): boolean {
  if (from && createdAt.slice(0, 10) < from) return false;
  if (to && createdAt.slice(0, 10) > to) return false;
  return true;
}

export class AiDashboardService {
  constructor(private deps: AiDashboardDeps) {}

  overview(user: User, workspaceId: string, query: AiDashboardQuery = {}): AiDashboardOverview {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");

    const records = this.deps.meter
      .list(workspaceId)
      .filter((r) => inRange(r.createdAt, query.from, query.to));
    const summary = this.deps.meter.summary(workspaceId, records);

    const byProvider = this.byProvider(records);
    const byModel = this.byModel(records);
    const byDay = this.byDay(records);

    const governanceAudit = this.deps.governanceAudit
      .list(workspaceId)
      .filter((r) => inRange(r.createdAt, query.from, query.to));
    const governance = this.governanceSummary(governanceAudit);

    const reviews = this.deps.reviews.list(workspaceId);
    const reviewQueue: DashboardReviews = {
      pending: reviews.filter((r) => r.status === "pending").length,
      approved: reviews.filter((r) => r.status === "approved").length,
      rejected: reviews.filter((r) => r.status === "rejected").length,
      total: reviews.length,
    };

    return {
      usage: {
        summary: {
          requests: summary.requests,
          okRequests: summary.okRequests,
          failedRequests: summary.failedRequests,
          promptTokens: summary.promptTokens,
          completionTokens: summary.completionTokens,
          totalTokens: summary.totalTokens,
          cost: summary.cost,
          avgLatencyMs: summary.avgLatencyMs ?? null,
        },
        byProvider,
        byModel,
        byDay,
      },
      quota: this.quotaSummary(workspaceId),
      governance,
      reviews: reviewQueue,
    };
  }

  audit(user: User, workspaceId: string, query: AiDashboardQuery = {}): PageResult<AiAuditEvent> {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");

    const events: AiAuditEvent[] = [];

    for (const record of this.deps.governanceAudit.list(workspaceId)) {
      if (!inRange(record.createdAt, query.from, query.to)) continue;
      if (query.event && record.event !== query.event) continue;
      if (query.model && record.model !== query.model) continue;
      events.push({
        id: record.id,
        createdAt: record.createdAt,
        source: "governance",
        event: record.event,
        actorId: record.actorId,
        model: record.model,
        detail: record.reasons.join("; ") || undefined,
      });
    }

    for (const record of this.deps.meter.list(workspaceId)) {
      if (!inRange(record.createdAt, query.from, query.to)) continue;
      if (query.provider && record.providerId !== query.provider) continue;
      if (query.model && record.model !== query.model) continue;
      if (query.event) {
        const eventName = record.ok ? "request_ok" : "request_failed";
        if (eventName !== query.event && record.errorCode !== query.event) continue;
      }
      events.push({
        id: record.id,
        createdAt: record.createdAt,
        source: "usage",
        event: record.ok ? "request_ok" : "request_failed",
        actorId: record.actorId,
        providerId: record.providerId,
        model: record.model,
        detail: record.ok ? undefined : record.errorCode,
      });
    }

    events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize ?? "20"), 10) || 20));
    return paginate(events, { page, pageSize, sort: "-createdAt", filters: {} });
  }

  private byDay(records: UsageRecord[]): DashboardByDay[] {
    const map = new Map<string, DashboardByDay>();
    for (const r of records) {
      const date = r.createdAt.slice(0, 10);
      const entry = map.get(date) ?? { date, requests: 0, tokens: 0, cost: 0 };
      entry.requests += 1;
      entry.tokens += r.totalTokens;
      entry.cost += r.cost;
      map.set(date, entry);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private byProvider(records: UsageRecord[]): DashboardByProvider[] {
    type Row = DashboardByProvider & { latencySum: number; latencyCount: number };
    const map = new Map<string, Row>();
    for (const r of records) {
      let entry = map.get(r.providerId);
      if (!entry) {
        entry = { providerId: r.providerId, requests: 0, tokens: 0, cost: 0, avgLatencyMs: null, latencySum: 0, latencyCount: 0 };
        map.set(r.providerId, entry);
      }
      entry.requests += 1;
      entry.tokens += r.totalTokens;
      entry.cost += r.cost;
      if (r.latencyMs !== undefined) {
        entry.latencySum += r.latencyMs;
        entry.latencyCount += 1;
      }
    }
    const rows = [...map.values()];
    for (const row of rows) {
      row.avgLatencyMs = row.latencyCount ? Math.round(row.latencySum / row.latencyCount) : null;
    }
    return rows.sort((a, b) => b.cost - a.cost);
  }

  private byModel(records: UsageRecord[]): DashboardByModel[] {
    const map = new Map<string, DashboardByModel>();
    for (const r of records) {
      const key = `${r.providerId}:${r.model}`;
      const entry = map.get(key) ?? { providerId: r.providerId, model: r.model, requests: 0, tokens: 0, cost: 0 };
      entry.requests += 1;
      entry.tokens += r.totalTokens;
      entry.cost += r.cost;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }

  private quotaSummary(workspaceId: string): DashboardQuota {
    const limits = this.deps.config.get(workspaceId).quota;
    const used = this.deps.meter.summary(workspaceId, this.deps.meter.today(workspaceId));
    const remaining: DashboardQuota["remaining"] = {};
    if (limits.requestsPerDay !== undefined) {
      remaining.requests = Math.max(0, limits.requestsPerDay - used.requests);
    }
    if (limits.tokensPerDay !== undefined) {
      remaining.tokens = Math.max(0, limits.tokensPerDay - used.totalTokens);
    }
    if (limits.costPerDay !== undefined) {
      remaining.cost = Math.max(0, Math.round((limits.costPerDay - used.cost) * 1000000) / 1000000);
    }
    return {
      limits,
      used: { requests: used.requests, tokens: used.totalTokens, cost: used.cost },
      remaining,
    };
  }

  private governanceSummary(
    records: { event: GovernanceAuditEvent; reasons: string[] }[],
  ): DashboardGovernance {
    const counts = {
      blocked: 0,
      flagged: 0,
      redacted: 0,
      review_required: 0,
      review_approved: 0,
      review_rejected: 0,
      allowed: 0,
    } as Record<GovernanceAuditEvent, number>;

    let piiRedactions = 0;
    let moderationBlocked = 0;
    let moderationFlagged = 0;
    const byCategory: Record<string, number> = {};

    for (const record of records) {
      if (record.event in counts) counts[record.event] += 1;
      const primary = record.event === "blocked" || record.event === "flagged" || record.event === "review_required";
      for (const reason of record.reasons) {
        if (reason.includes("Redacted PII")) piiRedactions += 1;
        const match = MODERATION_RE.exec(reason);
        if (match && primary) {
          const category = match[1];
          byCategory[category] = (byCategory[category] ?? 0) + 1;
          if (record.event === "blocked") moderationBlocked += 1;
          else moderationFlagged += 1;
        }
      }
    }

    return {
      counts,
      piiRedactions,
      moderation: { blocked: moderationBlocked, flagged: moderationFlagged, byCategory },
    };
  }
}
