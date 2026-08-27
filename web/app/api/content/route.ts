import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { ContentInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; input?: ContentInput } = {};
  try {
    body = (await request.json()) as { workspaceId?: string; input?: ContentInput };
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || !body.input) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and input are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const content = await api.createContent(body.workspaceId, body.input);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create content" } }, { status: 500 });
  }
}
