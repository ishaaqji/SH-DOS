import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";

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
  let body: { workspaceId?: string; scheduledAt?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || !body.scheduledAt) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and scheduledAt are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const content = await api.scheduleContent(body.workspaceId, contentId, body.scheduledAt);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to schedule content" } }, { status: 500 });
  }
}
