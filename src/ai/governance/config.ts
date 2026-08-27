import { MemoryStore, type Store } from "../../kernel/store";
import { now } from "../../kernel/ids";
import { ALL_PII_FIELDS } from "./pii";
import type { GovernancePolicy, GovernancePolicyPatch, WorkspaceGovernanceConfig } from "./types";

export function defaultGovernancePolicy(): GovernancePolicy {
  return {
    enabled: true,
    modelAllowlist: undefined,
    pii: {
      enabled: true,
      fields: [...ALL_PII_FIELDS],
      mode: "redact",
    },
    moderation: {
      enabled: true,
      blockCategories: ["hate", "violence", "sexual", "self_harm", "harmful"],
      flagCategories: ["harassment", "spam"],
    },
    inputSafety: {
      enabled: true,
      blockedTerms: [],
      maxPromptLength: 0,
      detectPromptInjection: true,
    },
    outputSafety: {
      enabled: true,
      blockedTerms: [],
      maxOutputLength: 0,
    },
    humanReview: {
      enabled: false,
    },
  };
}

export class GovernanceConfigStore {
  constructor(private store: Store<WorkspaceGovernanceConfig> = new MemoryStore<WorkspaceGovernanceConfig>()) {}

  get(workspaceId: string): WorkspaceGovernanceConfig {
    const existing = this.store.get(workspaceId);
    if (existing) return existing;
    const config: WorkspaceGovernanceConfig = {
      id: workspaceId,
      workspaceId,
      policy: defaultGovernancePolicy(),
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.insert(config);
    return this.get(workspaceId);
  }

  policy(workspaceId: string): GovernancePolicy {
    return this.get(workspaceId).policy;
  }

  update(workspaceId: string, patch: GovernancePolicyPatch): GovernancePolicy {
    const current = this.get(workspaceId);
    const modelAllowlist = patch.modelAllowlist === null ? undefined : patch.modelAllowlist;
    const next: GovernancePolicy = {
      ...current.policy,
      ...patch,
      modelAllowlist,
      pii: { ...current.policy.pii, ...patch.pii },
      moderation: { ...current.policy.moderation, ...patch.moderation },
      inputSafety: { ...current.policy.inputSafety, ...patch.inputSafety },
      outputSafety: { ...current.policy.outputSafety, ...patch.outputSafety },
      humanReview: { ...current.policy.humanReview, ...patch.humanReview },
    };
    this.store.update(workspaceId, { policy: next });
    return this.get(workspaceId).policy;
  }

  publicView(workspaceId: string): GovernancePolicy {
    return this.policy(workspaceId);
  }
}
