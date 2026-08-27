"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Field } from "../ui/input";
import { Card, CardBody, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import type { AiFindingSeverity, AiReviewAction, AiReviewRecord } from "@/lib/ai";

interface ReviewQueueProps {
  workspaceId: string;
  reviews: AiReviewRecord[];
  canManage: boolean;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function findingLabel(kind: string): string {
  return kind.replaceAll("_", " ");
}

function findingTone(severity: AiFindingSeverity): "danger" | "warning" | "neutral" {
  return severity === "block" ? "danger" : "warning";
}

function clamp(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function ReviewQueue({ workspaceId, reviews, canManage }: ReviewQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<AiReviewRecord[]>(reviews);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const decide = async (review: AiReviewRecord, action: AiReviewAction) => {
    setError(null);
    setNotice(null);
    const note = notes[review.id]?.trim() ?? "";
    if (action === "reject" && !note) {
      setError("A note is required to reject a request.");
      return;
    }
    setActing(review.id);
    try {
      const res = await fetch(`/api/ai/reviews/${encodeURIComponent(review.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, action, ...(note ? { note } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Review failed");
      setItems((prev) => prev.filter((item) => item.id !== review.id));
      setNotice(action === "approve" ? "Request approved." : "Request rejected.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardBody>
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="shield" size={22} />
            </span>
            <div className="empty-title">Review requires manage access</div>
            <p className="empty-desc">Only owners, admins and editors can approve or reject flagged AI requests.</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="check" size={22} />
            </span>
            <div className="empty-title">No pending reviews</div>
            <p className="empty-desc">
              The review queue is empty. When human review is enabled, flagged requests appear here for approval or rejection.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="review-queue">
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

      {items.map((review) => (
        <Card key={review.id} className="review-card">
          <CardHeader
            title={`Review ${shortId(review.id)}`}
            description={`Submitted by ${review.actorId}`}
            action={
              <Badge variant="warning">
                {formatDateTime(review.createdAt) || "pending"}
              </Badge>
            }
          />
          <CardBody>
            <div className="review-meta">
              <Badge variant="warning">pending review</Badge>
              <span className="mono text-xs text-muted">{review.id}</span>
            </div>

            <div className="review-summary">
              <div className="policy-section-title">Findings</div>
              {review.findings.length === 0 ? (
                <p className="empty-desc">No findings recorded.</p>
              ) : (
                <div className="review-findings">
                  {review.findings.map((finding, index) => (
                    <div key={index} className="review-finding">
                      <Badge variant={findingTone(finding.severity)}>{findingLabel(finding.kind)}</Badge>
                      {finding.category && <span className="mono text-xs text-muted">{finding.category}</span>}
                      <span>{finding.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="review-summary">
              <div className="policy-section-title">Request summary</div>
              {review.summary.messages && review.summary.messages.length > 0 ? (
                review.summary.messages.map((message, index) => (
                  <div key={index} className="review-message">
                    <span className="review-message-role">{message.role}</span>
                    {clamp(message.content)}
                  </div>
                ))
              ) : review.summary.output ? (
                <div className="review-message">
                  <span className="review-message-role">output</span>
                  {clamp(review.summary.output)}
                </div>
              ) : (
                <p className="empty-desc">No request content recorded.</p>
              )}
            </div>

            <div className="review-actions">
              <Field label="Note" hint="A note is required when rejecting.">
                <textarea
                  className="input textarea"
                  rows={2}
                  value={notes[review.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [review.id]: e.target.value })}
                  placeholder="Reason or context for this review…"
                />
              </Field>
              <div className="review-action-row">
                <Button
                  type="button"
                  variant="danger"
                  loading={acting === review.id}
                  disabled={acting !== null}
                  onClick={() => decide(review, "reject")}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  loading={acting === review.id}
                  disabled={acting !== null}
                  onClick={() => decide(review, "approve")}
                >
                  Approve
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
