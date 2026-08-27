"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/input";
import { Card, CardBody, CardHeader } from "../ui/card";
import {
  AI_PII_FIELDS,
  MODERATION_CATEGORIES,
  textToAllowlist,
  textToTerms,
  toggleItem,
  type AiGovernancePolicy,
  type AiGovernancePolicyPatch,
  type AiPiiField,
  type ModerationCategory,
} from "@/lib/ai";

interface GovernanceFormProps {
  workspaceId: string;
  policy: AiGovernancePolicy;
  canManage: boolean;
}

function positiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ");
}

export function GovernanceForm({ workspaceId, policy, canManage }: GovernanceFormProps) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [allowlistText, setAllowlistText] = useState(policy.modelAllowlist?.join("\n") ?? "");
  const [piiEnabled, setPiiEnabled] = useState(policy.pii.enabled);
  const [piiMode, setPiiMode] = useState<"redact" | "block">(policy.pii.mode);
  const [piiFields, setPiiFields] = useState<AiPiiField[]>(policy.pii.fields);
  const [modEnabled, setModEnabled] = useState(policy.moderation.enabled);
  const [modBlock, setModBlock] = useState<ModerationCategory[]>(policy.moderation.blockCategories);
  const [modFlag, setModFlag] = useState<ModerationCategory[]>(policy.moderation.flagCategories);
  const [inputEnabled, setInputEnabled] = useState(policy.inputSafety.enabled);
  const [inputTerms, setInputTerms] = useState(policy.inputSafety.blockedTerms.join("\n"));
  const [inputMaxLength, setInputMaxLength] = useState(String(policy.inputSafety.maxPromptLength));
  const [inputInjection, setInputInjection] = useState(policy.inputSafety.detectPromptInjection);
  const [outputEnabled, setOutputEnabled] = useState(policy.outputSafety.enabled);
  const [outputTerms, setOutputTerms] = useState(policy.outputSafety.blockedTerms.join("\n"));
  const [outputMaxLength, setOutputMaxLength] = useState(String(policy.outputSafety.maxOutputLength));
  const [humanEnabled, setHumanEnabled] = useState(policy.humanReview.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const patch: AiGovernancePolicyPatch = {
      enabled,
      modelAllowlist: textToAllowlist(allowlistText),
      pii: { enabled: piiEnabled, mode: piiMode, fields: piiFields },
      moderation: { enabled: modEnabled, blockCategories: modBlock, flagCategories: modFlag },
      inputSafety: {
        enabled: inputEnabled,
        blockedTerms: textToTerms(inputTerms),
        maxPromptLength: positiveInt(inputMaxLength, policy.inputSafety.maxPromptLength),
        detectPromptInjection: inputInjection,
      },
      outputSafety: {
        enabled: outputEnabled,
        blockedTerms: textToTerms(outputTerms),
        maxOutputLength: positiveInt(outputMaxLength, policy.outputSafety.maxOutputLength),
      },
      humanReview: { enabled: humanEnabled },
    };
    try {
      const res = await fetch("/api/ai/governance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Save failed");
      setNotice("Governance policy saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const togglePiiField = (field: AiPiiField) => setPiiFields((prev) => toggleItem(prev, field));
  const toggleModBlock = (cat: ModerationCategory) => setModBlock((prev) => toggleItem(prev, cat));
  const toggleModFlag = (cat: ModerationCategory) => setModFlag((prev) => toggleItem(prev, cat));

  return (
    <div className="settings-form">
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="form-notice" role="status">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader
          title="Governance policy"
          description="Controls how AI requests in this workspace are inspected, blocked and reviewed."
        />
        <CardBody>
          <div className="policy-section">
            <div className="policy-section-title">Policy status</div>
            <div className="policy-section-desc">
              When enabled, requests are inspected against the rules below before routing.
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canManage} />
              Governance enabled
            </label>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">Model allowlist</div>
            <div className="policy-section-desc">
              Restrict which models may be used. One model per line; leave empty to allow all models.
            </div>
            <Field>
              <textarea
                className="input textarea"
                rows={4}
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                disabled={!canManage}
                placeholder="e.g. gpt-4o-mini&#10;llama3.2"
              />
            </Field>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">PII protection</div>
            <div className="policy-section-desc">
              Detect personally identifiable information in prompts. Redact replaces values; block rejects the request.
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={piiEnabled} onChange={(e) => setPiiEnabled(e.target.checked)} disabled={!canManage} />
              PII detection enabled
            </label>
            <div className="settings-grid" style={{ marginTop: "0.75rem" }}>
              <Field label="Handling">
                <select className="select" value={piiMode} onChange={(e) => setPiiMode(e.target.value as "redact" | "block")} disabled={!canManage}>
                  <option value="redact">Redact</option>
                  <option value="block">Block</option>
                </select>
              </Field>
              <div>
                <span className="checkbox-grid-label">Fields</span>
                <div className="checkbox-grid">
                  {AI_PII_FIELDS.map((field) => (
                    <label key={field} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={piiFields.includes(field)}
                        onChange={() => togglePiiField(field)}
                        disabled={!canManage}
                      />
                      {titleCase(field)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">Content moderation</div>
            <div className="policy-section-desc">
              Moderate prompts for harmful categories. Blocked categories reject; flagged categories require review.
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={modEnabled} onChange={(e) => setModEnabled(e.target.checked)} disabled={!canManage} />
              Moderation enabled
            </label>
            <div className="settings-grid" style={{ marginTop: "0.75rem" }}>
              <div>
                <span className="checkbox-grid-label">Block categories</span>
                <div className="checkbox-grid">
                  {MODERATION_CATEGORIES.map((cat) => (
                    <label key={cat} className="checkbox-row">
                      <input type="checkbox" checked={modBlock.includes(cat)} onChange={() => toggleModBlock(cat)} disabled={!canManage} />
                      {titleCase(cat)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="checkbox-grid-label">Flag categories</span>
                <div className="checkbox-grid">
                  {MODERATION_CATEGORIES.map((cat) => (
                    <label key={cat} className="checkbox-row">
                      <input type="checkbox" checked={modFlag.includes(cat)} onChange={() => toggleModFlag(cat)} disabled={!canManage} />
                      {titleCase(cat)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">Input safety</div>
            <div className="policy-section-desc">Reject prompts containing blocked terms, prompt injection, or overly long prompts.</div>
            <label className="checkbox-row">
              <input type="checkbox" checked={inputEnabled} onChange={(e) => setInputEnabled(e.target.checked)} disabled={!canManage} />
              Input safety enabled
            </label>
            <div className="settings-grid" style={{ marginTop: "0.75rem" }}>
              <Field label="Blocked terms" hint="One term per line.">
                <textarea
                  className="input textarea"
                  rows={3}
                  value={inputTerms}
                  onChange={(e) => setInputTerms(e.target.value)}
                  disabled={!canManage}
                />
              </Field>
              <div>
                <Field label="Max prompt length">
                  <Input
                    type="number"
                    min={0}
                    value={inputMaxLength}
                    onChange={(e) => setInputMaxLength(e.target.value)}
                    disabled={!canManage}
                  />
                </Field>
                <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
                  <input type="checkbox" checked={inputInjection} onChange={(e) => setInputInjection(e.target.checked)} disabled={!canManage} />
                  Detect prompt injection
                </label>
              </div>
            </div>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">Output safety</div>
            <div className="policy-section-desc">Flag model responses containing blocked terms or over the maximum length.</div>
            <label className="checkbox-row">
              <input type="checkbox" checked={outputEnabled} onChange={(e) => setOutputEnabled(e.target.checked)} disabled={!canManage} />
              Output safety enabled
            </label>
            <div className="settings-grid" style={{ marginTop: "0.75rem" }}>
              <Field label="Blocked terms" hint="One term per line.">
                <textarea
                  className="input textarea"
                  rows={3}
                  value={outputTerms}
                  onChange={(e) => setOutputTerms(e.target.value)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Max output length">
                <Input
                  type="number"
                  min={0}
                  value={outputMaxLength}
                  onChange={(e) => setOutputMaxLength(e.target.value)}
                  disabled={!canManage}
                />
              </Field>
            </div>
          </div>

          <div className="policy-section">
            <div className="policy-section-title">Human review</div>
            <div className="policy-section-desc">
              When enabled, flagged requests are queued in the review tab and only routed after an admin or editor approves them.
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={humanEnabled} onChange={(e) => setHumanEnabled(e.target.checked)} disabled={!canManage} />
              Human review enabled
            </label>
          </div>

          {canManage && (
            <div className="form-actions">
              <Button type="button" loading={busy} onClick={submit}>
                Save policy
              </Button>
            </div>
          )}
          {!canManage && <p className="empty-desc">You have view-only access. Ask an owner, admin or editor to change the governance policy.</p>}
        </CardBody>
      </Card>
    </div>
  );
}
