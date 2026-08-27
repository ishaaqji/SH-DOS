import type { EventBus } from "../../kernel/events";
import { newId } from "../../kernel/ids";
import type { IdentityService, User } from "../../identity/identity";
import type { AiRouter } from "../router/service";
import type { AiChatResponse, AiMessage } from "../types";
import { AiError } from "../errors";
import type { GovernanceConfigStore } from "./config";
import { GovernancePolicyEngine } from "./policy";
import type { GovernanceAuditStore } from "./audit";
import type { HumanReviewStore } from "./human-review";
import type { GovernanceAuditRecord, GovernanceFinding, GovernancePolicy, GovernancePolicyPatch, ReviewRecord } from "./types";

export interface AiGovernanceDeps {
  identity: IdentityService;
  bus: EventBus;
  router: AiRouter;
  config: GovernanceConfigStore;
  engine: GovernancePolicyEngine;
  reviews: HumanReviewStore;
  audit: GovernanceAuditStore;
}

export type GovernedExecuteInput = {
  taskType?: string;
  preferredProvider?: string;
  preferredModel?: string;
  maxCost?: number;
  fallbackPolicy?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
};

export class AiGovernance {
  constructor(private deps: AiGovernanceDeps) {}

  policy(user: User, workspaceId: string): GovernancePolicy {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    return this.deps.config.publicView(workspaceId);
  }

  updatePolicy(user: User, workspaceId: string, patch: GovernancePolicyPatch): GovernancePolicy {
    this.deps.identity.authorize(user, workspaceId, "ai", "manage");
    return this.deps.config.update(workspaceId, patch);
  }

  async inspect(user: User, workspaceId: string, input: GovernedExecuteInput): Promise<unknown> {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    this.validateInput(input);
    const policy = this.deps.config.policy(workspaceId);
    const result = await this.deps.engine.inspectInput(policy, input.messages);
    return {
      verdict: result.decision.verdict,
      findings: result.decision.findings,
      requiresReview: result.decision.requiresReview,
      redactedMessages: result.messages,
    };
  }

  async execute(user: User, workspaceId: string, input: GovernedExecuteInput): Promise<AiChatResponse> {
    this.deps.identity.authorize(user, workspaceId, "ai", "use");
    this.validateInput(input);
    const policy = this.deps.config.policy(workspaceId);

    if (!policy.enabled) {
      return this.deps.router.complete(user, workspaceId, this.toRoutingInput(input));
    }

    const inspected = await this.deps.engine.inspectInput(policy, input.messages);
    if (inspected.decision.verdict === "block") {
      await this.recordBlocked(user, workspaceId, "blocked", inspected.decision.findings, input.preferredModel);
      const first = inspected.decision.findings[0];
      throw new AiError("AI_BLOCKED", `Request blocked by governance policy (${first.kind}: ${first.detail})`, {
        status: 403,
        model: input.preferredModel,
      });
    }

    if (inspected.decision.requiresReview) {
      const review = await this.createReview(user, workspaceId, input, inspected.decision.findings, input.messages);
      await this.recordAudit({
        workspaceId,
        actorId: user.id,
        event: "review_required",
        reasons: inspected.decision.findings.map((f) => f.detail),
        model: input.preferredModel,
        reviewId: review.id,
      });
      await this.emitEvent("ai.governance.review_required", workspaceId, {
        actorId: user.id,
        reviewId: review.id,
        reasons: inspected.decision.findings.map((f) => f.detail),
      });
      throw new AiError(
        "AI_REVIEW_REQUIRED",
        "Request flagged for human review; awaiting approval",
        { status: 403, model: input.preferredModel },
      );
    }

    // Execute with (possibly PII-redacted) messages.
    let response: AiChatResponse;
    try {
      response = await this.deps.router.complete(user, workspaceId, this.toRoutingInput(input, inspected.messages));
    } catch (err) {
      await this.recordAudit({
        workspaceId,
        actorId: user.id,
        event: "flagged",
        reasons: [err instanceof AiError ? err.code : "AI_PROVIDER_ERROR"],
        model: input.preferredModel,
      });
      throw err;
    }

    const output = await this.deps.engine.inspectOutput(policy, response.content);
    if (output.verdict === "block") {
      await this.recordBlocked(user, workspaceId, "blocked", output.findings, response.model);
      const first = output.findings[0];
      throw new AiError("AI_BLOCKED", `Output blocked by governance policy (${first.kind}: ${first.detail})`, {
        status: 403,
        model: response.model,
      });
    }
    if (output.requiresReview) {
      const review = await this.createReview(user, workspaceId, input, output.findings, undefined, response.content);
      await this.recordAudit({
        workspaceId,
        actorId: user.id,
        event: "review_required",
        reasons: output.findings.map((f) => f.detail),
        model: response.model,
        reviewId: review.id,
      });
      await this.emitEvent("ai.governance.review_required", workspaceId, {
        actorId: user.id,
        reviewId: review.id,
        reasons: output.findings.map((f) => f.detail),
      });
      throw new AiError("AI_REVIEW_REQUIRED", "Output flagged for human review; awaiting approval", {
        status: 403,
        model: response.model,
      });
    }

    await this.recordAudit({
      workspaceId,
      actorId: user.id,
      event: "allowed",
      reasons: inspected.decision.findings.map((f) => f.detail),
      model: response.model,
    });
    await this.emitEvent("ai.governance.allowed", workspaceId, {
      actorId: user.id,
      model: response.model,
      findings: inspected.decision.findings.map((f) => f.detail),
    });
    return response;
  }

  reviews(user: User, workspaceId: string): ReviewRecord[] {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    return this.deps.reviews.list(workspaceId);
  }

  pendingReviews(user: User, workspaceId: string): ReviewRecord[] {
    this.deps.identity.authorize(user, workspaceId, "ai", "manage");
    return this.deps.reviews.listPending(workspaceId);
  }

  review(
    user: User,
    workspaceId: string,
    reviewId: string,
    action: "approve" | "reject",
    note?: string,
  ): ReviewRecord {
    this.deps.identity.authorize(user, workspaceId, "ai", "manage");
    const record = this.deps.reviews.get(reviewId);
    if (record.workspaceId !== workspaceId) {
      throw new AiError("AI_INVALID_REQUEST", "Review does not belong to this workspace", { status: 404 });
    }
    const status = action === "approve" ? "approved" : "rejected";
    const updated = this.deps.reviews.transition(reviewId, status, user.id, note);
    const event = action === "approve" ? "review_approved" : "review_rejected";
    void this.recordAudit({
      workspaceId,
      actorId: user.id,
      event,
      reasons: record.findings.map((f) => f.detail),
      reviewId,
    });
    void this.emitEvent(`ai.governance.${event}`, workspaceId, { actorId: user.id, reviewId });
    return updated;
  }

  auditLog(user: User, workspaceId: string): GovernanceAuditRecord[] {
    this.deps.identity.authorize(user, workspaceId, "ai", "read");
    return [...this.deps.audit.list(workspaceId)].reverse();
  }

  private async createReview(
    user: User,
    workspaceId: string,
    input: GovernedExecuteInput,
    findings: GovernanceFinding[],
    messages?: AiMessage[],
    output?: string,
  ): Promise<ReviewRecord> {
    return this.deps.reviews.create({
      workspaceId,
      actorId: user.id,
      summary: output !== undefined ? { output } : { messages: messages ? [...messages] : input.messages },
      findings,
    });
  }

  private async recordBlocked(
    user: User,
    workspaceId: string,
    event: "blocked" | "flagged",
    findings: GovernanceFinding[],
    model?: string,
  ): Promise<void> {
    await this.recordAudit({
      workspaceId,
      actorId: user.id,
      event,
      reasons: findings.map((f) => f.detail),
      model,
    });
    await this.emitEvent(`ai.governance.${event}`, workspaceId, {
      actorId: user.id,
      reasons: findings.map((f) => f.detail),
      model,
    });
  }

  private async recordAudit(input: Omit<GovernanceAuditRecord, "id" | "createdAt" | "updatedAt">): Promise<void> {
    this.deps.audit.record(input);
  }

  private async emitEvent(type: string, workspaceId: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.bus.emit({ type, aggregateId: newId("ai"), workspaceId, at: new Date(), payload });
  }

  private toRoutingInput(input: GovernedExecuteInput, messages?: AiMessage[]) {
    return {
      taskType: input.taskType as never,
      preferredProvider: input.preferredProvider,
      preferredModel: input.preferredModel,
      maxCost: input.maxCost,
      fallbackPolicy: input.fallbackPolicy as never,
      messages: messages ?? input.messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    };
  }

  private validateInput(input: GovernedExecuteInput): void {
    if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
      throw new AiError("AI_INVALID_REQUEST", "messages must be a non-empty array", { status: 400 });
    }
    for (const m of input.messages) {
      if (!m || typeof m.content !== "string") {
        throw new AiError("AI_INVALID_REQUEST", "each message requires role and content", { status: 400 });
      }
    }
  }
}
