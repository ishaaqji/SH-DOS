"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Field } from "../ui/input";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import {
  AI_ASSISTANT_TASKS,
  buildAssistantMessages,
  assistantErrorState,
  formatCost,
  formatUsage,
  type AiAssistantTask,
  type AiChatResponse,
} from "@/lib/ai";

interface AssistantPanelProps {
  workspaceId: string;
  canUse: boolean;
}

export function AssistantPanel({ workspaceId, canUse }: AssistantPanelProps) {
  const [task, setTask] = useState<AiAssistantTask>("chat");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [result, setResult] = useState<AiChatResponse | null>(null);
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null);

  const selected = AI_ASSISTANT_TASKS.find((t) => t.value === task);

  const submit = async () => {
    if (busy || !prompt.trim()) return;
    const ac = new AbortController();
    setController(ac);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          input: { taskType: task, messages: buildAssistantMessages(task, prompt) },
        }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw { code: data?.error?.code ?? null, message: data?.error?.message ?? "Request failed" };
      }
      setResult(data.response as AiChatResponse);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError({ code: "CANCELLED", message: "Request cancelled." });
      } else {
        const e = err as { code?: string; message?: string };
        setError({ code: e.code ?? null, message: e.message ?? "Request failed" });
      }
    } finally {
      setBusy(false);
      setController(null);
    }
  };

  const cancel = () => {
    controller?.abort();
  };

  const errorState = error ? assistantErrorState(error.code) : null;

  return (
    <div className="settings-form">
      <Card>
        <CardHeader
          title="Compose a request"
          description="Requests run through the workspace governance policy, quota and model routing before reaching any provider."
        />
        <CardBody>
          {!canUse && (
            <div className="auth-error" role="alert">
              You have view-only access. Ask an owner, admin, editor or author to run AI requests.
            </div>
          )}

          <div className="settings-grid">
            <Field label="Task template" hint={selected?.hint}>
              <select
                className="select"
                value={task}
                onChange={(e) => setTask(e.target.value as AiAssistantTask)}
                disabled={!canUse}
              >
                {AI_ASSISTANT_TASKS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Prompt" hint="The text or instruction sent to the model.">
            <textarea
              className="input textarea"
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={!canUse || busy}
              placeholder={
                task === "chat"
                  ? "Ask anything…"
                  : "Paste the text to summarize, translate, extract facts from, or turn into code…"
              }
            />
          </Field>

          <div className="form-actions">
            {busy ? (
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <Button type="button" loading={busy} disabled={!canUse || !prompt.trim()} onClick={submit}>
                Run request
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card style={{ marginTop: "1.5rem" }}>
        <CardHeader title="Response" description="The model output, inspected by the workspace governance policy." />
        <CardBody>
          {busy ? (
            <div className="empty-state" aria-live="polite">
              <span className="empty-icon">
                <Icon name="ai" size={22} />
              </span>
              <div className="empty-title">Running request</div>
              <p className="empty-desc">Your request is being inspected and routed through the workspace AI pipeline…</p>
            </div>
          ) : errorState ? (
            <div className={`assistant-banner assistant-banner-${errorState.tone}`} role="alert">
              <div className="assistant-banner-title">{errorState.title}</div>
              <div className="assistant-banner-desc">{errorState.description || error?.message || "Please try again."}</div>
            </div>
          ) : result ? (
            <div className="assistant-result">
              <div className="review-meta">
                <Badge variant="success">completed</Badge>
                <span className="mono text-xs text-muted">{result.model}</span>
                <span className="text-xs text-muted">{result.provider}</span>
                <time className="text-xs text-faint" dateTime={result.createdAt}>
                  {new Date(result.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <div className="review-message assistant-result-content">{result.content}</div>
              <div className="assistant-usage">
                <span className="text-xs text-muted">{formatUsage(result.usage)}</span>
                <span className="text-xs text-muted">cost {formatCost(result.cost)}</span>
              </div>
              <p className="empty-desc" style={{ marginTop: "0.5rem" }}>
                Inspected and allowed by the workspace governance policy.
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="ai" size={22} />
              </span>
              <div className="empty-title">No request yet</div>
              <p className="empty-desc">Your AI responses will appear here once you run a request.</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
