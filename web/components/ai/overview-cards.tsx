import { Card, CardBody, CardHeader } from "../ui/card";
import { Icon } from "../ui/icons";
import { Badge } from "../ui/badge";
import {
  formatCost,
  formatTokens,
  eventLabel,
  type AiDashboardOverview,
} from "@/lib/ai";

interface OverviewCardsProps {
  data: AiDashboardOverview;
}

export function OverviewCards({ data }: OverviewCardsProps) {
  const { usage, quota, governance, reviews } = data;
  const s = usage.summary;
  const costText = formatCost(s.cost);
  const costHint =
    quota.limits.costPerDay !== undefined ? `of ${formatCost(quota.limits.costPerDay)} daily limit` : "estimated cost";

  return (
    <div className="ai-overview">
      <div className="kpi-grid">
        <Card className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon">
              <Icon name="activity" size={18} />
            </span>
            <span className="stat-label">Requests</span>
          </div>
          <div className="stat-value">{s.requests.toLocaleString()}</div>
          <div className="stat-hint">
            {s.okRequests} ok · {s.failedRequests} failed
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon">
              <Icon name="server" size={18} />
            </span>
            <span className="stat-label">Tokens</span>
          </div>
          <div className="stat-value">{formatTokens(s.totalTokens)}</div>
          <div className="stat-hint">
            {formatTokens(s.promptTokens)} prompt · {formatTokens(s.completionTokens)} completion
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon">
              <Icon name="analytics" size={18} />
            </span>
            <span className="stat-label">Estimated cost</span>
          </div>
          <div className="stat-value">{costText}</div>
          <div className="stat-hint">{costHint}</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon">
              <Icon name="clock" size={18} />
            </span>
            <span className="stat-label">Avg latency</span>
          </div>
          <div className="stat-value">
            {s.avgLatencyMs === null ? "—" : `${s.avgLatencyMs.toLocaleString()} ms`}
          </div>
          <div className="stat-hint">Mean response time per request</div>
        </Card>
      </div>

      <QuotaCard quota={data.quota} />

      <div className="ai-grid">
        <Card>
          <CardHeader title="Usage by model" description="Cost and token usage per model in the current range." />
          <CardBody>
            <UsageModelTable rows={usage.byModel} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Usage by provider" description="Volume, latency and cost per provider." />
          <CardBody>
            <UsageProviderTable rows={usage.byProvider} />
          </CardBody>
        </Card>
      </div>

      <div className="ai-grid">
        <Card>
          <CardHeader title="Governance" description="Policy actions applied to AI requests in this workspace." />
          <CardBody>
            <GovernanceTable governance={governance} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Human review queue" description="Requests gated for human approval." />
          <CardBody>
            <ReviewQueue reviews={reviews} />
          </CardBody>
        </Card>
      </div>

      {usage.byDay.length > 1 && (
        <Card>
          <CardHeader title="Usage by day" description="Request volume across the selected date range." />
          <CardBody>
            <ByDayTable rows={usage.byDay} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function QuotaCard({ quota }: { quota: AiDashboardOverview["quota"] }) {
  const { limits, used, remaining } = quota;
  const hasRequestLimit = limits.requestsPerDay !== undefined;
  const hasTokenLimit = limits.tokensPerDay !== undefined;
  const hasCostLimit = limits.costPerDay !== undefined;
  const pct = (value: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0);

  if (!hasRequestLimit && !hasTokenLimit && !hasCostLimit) {
    return (
      <Card>
        <CardHeader title="Quota" description="Daily usage limits for this workspace." />
        <CardBody>
          <p className="text-sm text-muted">No quota limits configured. AI requests are uncapped.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Quota consumption" description="Today's usage against the configured daily limits." />
      <CardBody>
        <div className="quota-list">
          {hasRequestLimit && (
            <QuotaRow
              label="Requests"
              used={used.requests}
              limit={limits.requestsPerDay!}
              remaining={remaining.requests}
              pct={pct(used.requests, limits.requestsPerDay!)}
            />
          )}
          {hasTokenLimit && (
            <QuotaRow
              label="Tokens"
              used={used.tokens}
              limit={limits.tokensPerDay!}
              remaining={remaining.tokens}
              pct={pct(used.tokens, limits.tokensPerDay!)}
            />
          )}
          {hasCostLimit && (
            <QuotaRow
              label="Cost"
              used={used.cost}
              limit={limits.costPerDay!}
              remaining={remaining.cost}
              pct={pct(used.cost, limits.costPerDay!)}
              currency
            />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function QuotaRow({
  label,
  used,
  limit,
  remaining,
  pct,
  currency = false,
}: {
  label: string;
  used: number;
  limit: number;
  remaining?: number;
  pct: number;
  currency?: boolean;
}) {
  const fmt = (value: number) => (currency ? formatCost(value) : value.toLocaleString());
  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "ok";
  return (
    <div className="quota-row">
      <div className="quota-row-head">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-faint mono">
          {fmt(used)} / {fmt(limit)}
        </span>
      </div>
      <div className="quota-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`quota-bar ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="quota-row-foot">
        <span className="text-xs text-faint">{pct}% used</span>
        {remaining !== undefined && <span className="text-xs text-faint">{fmt(remaining)} remaining</span>}
      </div>
    </div>
  );
}

function UsageModelTable({ rows }: { rows: AiDashboardOverview["usage"]["byModel"] }) {
  if (rows.length === 0) return <TableEmpty text="No model usage in the selected range." />;
  return (
    <div className="content-table-wrap">
      <table className="content-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Provider</th>
            <th className="num">Requests</th>
            <th className="num">Tokens</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.providerId}:${row.model}`}>
              <td>
                <span className="mono">{row.model}</span>
              </td>
              <td>{row.providerId}</td>
              <td className="num">{row.requests.toLocaleString()}</td>
              <td className="num">{formatTokens(row.tokens)}</td>
              <td className="num">{formatCost(row.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageProviderTable({ rows }: { rows: AiDashboardOverview["usage"]["byProvider"] }) {
  if (rows.length === 0) return <TableEmpty text="No provider usage in the selected range." />;
  return (
    <div className="content-table-wrap">
      <table className="content-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th className="num">Requests</th>
            <th className="num">Tokens</th>
            <th className="num">Avg latency</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.providerId}>
              <td>
                <span className="mono">{row.providerId}</span>
              </td>
              <td className="num">{row.requests.toLocaleString()}</td>
              <td className="num">{formatTokens(row.tokens)}</td>
              <td className="num">{row.avgLatencyMs === null ? "—" : `${row.avgLatencyMs} ms`}</td>
              <td className="num">{formatCost(row.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GovernanceTable({ governance }: { governance: AiDashboardOverview["governance"] }) {
  const counts = governance.counts;
  const rows = [
    { label: "Blocked", value: counts.blocked, tone: "danger" as const, hint: "Rejected by policy" },
    { label: "Flagged", value: counts.flagged, tone: "warning" as const, hint: "Needs attention" },
    { label: "PII redacted", value: governance.piiRedactions, tone: "primary" as const, hint: "Sensitive fields removed" },
    { label: "Review required", value: counts.review_required, tone: "warning" as const, hint: "Parked for approval" },
    { label: "Allowed", value: counts.allowed, tone: "success" as const, hint: "Passed policy checks" },
  ];
  return (
    <div>
      <div className="governance-list">
        {rows.map((row) => (
          <div key={row.label} className="governance-row">
            <div>
              <span className="text-sm font-medium">{row.label}</span>
              <span className="text-xs text-faint">{row.hint}</span>
            </div>
            <Badge variant={row.tone}>{row.value.toLocaleString()}</Badge>
          </div>
        ))}
      </div>
      <div className="governance-moderation">
        <span className="text-sm font-medium">Moderation</span>
        <p className="text-xs text-muted">
          {governance.moderation.blocked} blocked · {governance.moderation.flagged} flagged
        </p>
        {Object.keys(governance.moderation.byCategory).length > 0 ? (
          <div className="badge-row">
            {Object.entries(governance.moderation.byCategory).map(([category, count]) => (
              <Badge key={category} variant="neutral">
                {eventLabel(category)} · {count}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-faint">No moderation categories matched.</p>
        )}
      </div>
    </div>
  );
}

function ReviewQueue({ reviews }: { reviews: AiDashboardOverview["reviews"] }) {
  const rows = [
    { label: "Pending", value: reviews.pending, tone: "warning" as const },
    { label: "Approved", value: reviews.approved, tone: "success" as const },
    { label: "Rejected", value: reviews.rejected, tone: "danger" as const },
  ];
  return (
    <div className="governance-list">
      {rows.map((row) => (
        <div key={row.label} className="governance-row">
          <span className="text-sm font-medium">{row.label}</span>
          <Badge variant={row.tone}>{row.value.toLocaleString()}</Badge>
        </div>
      ))}
      <p className="text-xs text-faint">{reviews.total} total reviews in this workspace</p>
    </div>
  );
}

function ByDayTable({ rows }: { rows: AiDashboardOverview["usage"]["byDay"] }) {
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <div className="byday-list">
      {rows.map((row) => (
        <div key={row.date} className="byday-row">
          <span className="byday-date mono">{row.date}</span>
          <div className="byday-track">
            <div className="byday-bar" style={{ width: `${Math.round((row.requests / max) * 100)}%` }} />
          </div>
          <span className="byday-meta text-xs text-faint">
            {row.requests.toLocaleString()} req · {formatTokens(row.tokens)} tok · {formatCost(row.cost)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TableEmpty({ text }: { text: string }) {
  return (
    <div className="empty-state" style={{ padding: "1rem" }}>
      <div className="empty-title">Nothing yet</div>
      <p className="empty-desc">{text}</p>
    </div>
  );
}
