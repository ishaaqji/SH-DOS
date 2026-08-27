import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { AiConfigUpdate } from "@/lib/ai";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; patch?: AiConfigUpdate } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || !body.patch) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "workspaceId and patch are required" } },
      { status: 400 },
    );
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const config = await api.updateAiConfig(body.workspaceId, body.patch);
    return NextResponse.json({ config });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update AI config" } }, { status: 500 });
  }
}
