import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { WorkflowStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { contentId } = await params;
  let body: { workspaceId?: string; to?: WorkflowStatus } = {};
  try {
    body = (await request.json()) as { workspaceId?: string; to?: WorkflowStatus };
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || !body.to) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and to are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const content = await api.transitionContent(body.workspaceId, contentId, body.to);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to transition content" } }, { status: 500 });
  }
}
