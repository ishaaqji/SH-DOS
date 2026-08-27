import type { AiMessage } from "../types";
import { detectPii, redactMessages } from "./pii";
import type { ContentModerator } from "./moderation";
import type { GovernanceDecision, GovernanceFinding, GovernancePolicy } from "./types";

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|above|prior)\s+instructions/i,
  /you\s+are\s+now\s+(the\s+)?(system|gpt|unrestricted|developer)/i,
  /reveal\s+(your\s+)?(system|initial|hidden)\s+prompt/i,
  /disregard\s+(all\s+)?(prior|previous)\s+(rules|instructions|guidelines)/i,
  /jailbreak|do\s+anything\s+now/i,
];

function joinedText(messages: AiMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

export interface InputInspectionResult {
  decision: GovernanceDecision;
  messages: AiMessage[];
}

export class GovernancePolicyEngine {
  constructor(private moderator: ContentModerator) {}

  async inspectInput(policy: GovernancePolicy, messages: AiMessage[]): Promise<InputInspectionResult> {
    if (!policy.enabled) return { decision: this.allowed(), messages };
    const findings: GovernanceFinding[] = [];
    const inputPolicy = policy.inputSafety;
    const moderation = policy.moderation;
    const pii = policy.pii;

    const text = joinedText(messages);

    // Input safety policy: blocked terms, length, prompt injection.
    if (inputPolicy.enabled) {
      const lower = text.toLowerCase();
      for (const term of inputPolicy.blockedTerms) {
        if (term && lower.includes(term.toLowerCase())) {
          findings.push({
            kind: "input_safety",
            category: "blocked_term",
            severity: "block",
            detail: `Prompt contains blocked term "${term}"`,
          });
        }
      }
      if (inputPolicy.maxPromptLength > 0 && text.length > inputPolicy.maxPromptLength) {
        findings.push({
          kind: "input_safety",
          category: "max_length",
          severity: "block",
          detail: `Prompt exceeds max length ${inputPolicy.maxPromptLength}`,
        });
      }
      if (inputPolicy.detectPromptInjection) {
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
          if (pattern.test(text)) {
            findings.push({
              kind: "input_safety",
              category: "prompt_injection",
              severity: "block",
              detail: "Prompt looks like a prompt injection attempt",
            });
          }
        }
      }
    }

    // Content moderation hooks (input).
    if (moderation.enabled) {
      const hits = await this.moderator.moderate(text);
      for (const hit of hits) {
        const severity = moderation.blockCategories.includes(hit.category)
          ? "block"
          : moderation.flagCategories.includes(hit.category)
            ? "flag"
            : undefined;
        if (severity) {
          findings.push({
            kind: "moderation",
            category: hit.category,
            severity,
            detail: `Input matched ${hit.category} policy ("${hit.matched}")`,
          });
        }
      }
    }

    // PII detection/redaction.
    let messagesOut = messages;
    if (pii.enabled) {
      if (pii.mode === "block") {
        const matches = detectPii(text, pii.fields);
        if (matches.length > 0) {
          findings.push({
            kind: "pii",
            category: "pii",
            severity: "block",
            detail: `Input contains PII (${matches.map((m) => m.field).join(", ")})`,
          });
        }
      } else {
        const redacted = redactMessages(messages, pii.fields);
        if (redacted.redactions.length > 0) {
          messagesOut = redacted.messages;
          findings.push({
            kind: "pii",
            category: "pii",
            severity: "flag",
            detail: `Redacted PII (${[...new Set(redacted.redactions.map((r) => r.field))].join(", ")})`,
          });
        }
      }
    }

    return { decision: this.decide(policy, findings), messages: messagesOut };
  }

  async inspectOutput(policy: GovernancePolicy, output: string): Promise<GovernanceDecision> {
    if (!policy.enabled) return this.allowed();
    const findings: GovernanceFinding[] = [];
    const outputPolicy = policy.outputSafety;
    const moderation = policy.moderation;

    if (outputPolicy.enabled) {
      const lower = output.toLowerCase();
      for (const term of outputPolicy.blockedTerms) {
        if (term && lower.includes(term.toLowerCase())) {
          findings.push({
            kind: "output_safety",
            category: "blocked_term",
            severity: "block",
            detail: `Output contains blocked term "${term}"`,
          });
        }
      }
      if (outputPolicy.maxOutputLength > 0 && output.length > outputPolicy.maxOutputLength) {
        findings.push({
          kind: "output_safety",
          category: "max_length",
          severity: "block",
          detail: `Output exceeds max length ${outputPolicy.maxOutputLength}`,
        });
      }
    }

    if (moderation.enabled) {
      const hits = await this.moderator.moderate(output);
      for (const hit of hits) {
        const severity = moderation.blockCategories.includes(hit.category)
          ? "block"
          : moderation.flagCategories.includes(hit.category)
            ? "flag"
            : undefined;
        if (severity) {
          findings.push({
            kind: "moderation",
            category: hit.category,
            severity,
            detail: `Output matched ${hit.category} policy ("${hit.matched}")`,
          });
        }
      }
    }

    return this.decide(policy, findings);
  }

  private decide(policy: GovernancePolicy, findings: GovernanceFinding[]): GovernanceDecision {
    const blocks = findings.filter((f) => f.severity === "block");
    const flags = findings.filter((f) => f.severity === "flag");
    const verdict: GovernanceDecision["verdict"] =
      blocks.length > 0 ? "block" : flags.length > 0 ? "flag" : "allow";
    const requiresReview = policy.humanReview.enabled && flags.length > 0 && blocks.length === 0;
    return { verdict, findings, requiresReview };
  }

  private allowed(): GovernanceDecision {
    return { verdict: "allow", findings: [], requiresReview: false };
  }
}
