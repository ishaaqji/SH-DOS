import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { Content, WorkflowStatus } from "@/lib/types";

export const runtime = "nodejs";

type BulkAction =
  | { action: "delete"; ids: string[] }
  | { action: "transition"; ids: string[]; to: WorkflowStatus };

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; action?: string; ids?: string[]; to?: WorkflowStatus } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const { workspaceId, action, ids, to } = body;
  if (!workspaceId || !action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId, action and ids are required" } }, { status: 400 });
  }
  if (action === "transition" && !to) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "to is required for transition" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  const op: BulkAction =
    action === "transition" ? { action: "transition", ids, to: to! } : { action: "delete", ids };

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  try {
    for (const id of op.ids) {
      try {
        let content: Content;
        if (op.action === "delete") {
          content = await api.deleteContent(workspaceId, id);
        } else {
          content = await api.transitionContent(workspaceId, id, op.to);
        }
        results.push({ id, ok: true });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Request failed";
        results.push({ id, ok: false, error: message });
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Bulk action failed" } }, { status: 500 });
  }
}
