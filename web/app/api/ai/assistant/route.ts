import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { AiAssistantInput } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; input?: AiAssistantInput } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (
    !body.workspaceId ||
    !body.input ||
    !Array.isArray(body.input.messages) ||
    body.input.messages.length === 0
  ) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "workspaceId and non-empty input.messages are required" } },
      { status: 400 },
    );
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const response = await api.governedAiExecute(body.workspaceId, body.input);
    return NextResponse.json({ response });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to run AI request" } }, { status: 500 });
  }
}
