import type { AiConfigStore } from "./config";
import type { UsageMeter } from "./metering";
import { AiError } from "./errors";

export class QuotaEnforcer {
  constructor(private config: AiConfigStore, private meter: UsageMeter) {}

  assertCanRequest(workspaceId: string): void {
    const quota = this.config.get(workspaceId).quota;
    const today = this.meter.today(workspaceId);
    const summary = this.meter.summary(workspaceId, today);

    if (quota.requestsPerDay !== undefined && summary.requests >= quota.requestsPerDay) {
      throw new AiError(
        "AI_QUOTA_EXCEEDED",
        `Daily request quota of ${quota.requestsPerDay} reached`,
        { status: 429 },
      );
    }
    if (quota.tokensPerDay !== undefined && summary.totalTokens >= quota.tokensPerDay) {
      throw new AiError(
        "AI_QUOTA_EXCEEDED",
        `Daily token quota of ${quota.tokensPerDay} reached`,
        { status: 429 },
      );
    }
    if (quota.costPerDay !== undefined && summary.cost >= quota.costPerDay) {
      throw new AiError(
        "AI_QUOTA_EXCEEDED",
        `Daily cost quota of $${quota.costPerDay} reached`,
        { status: 429 },
      );
    }
  }
}
