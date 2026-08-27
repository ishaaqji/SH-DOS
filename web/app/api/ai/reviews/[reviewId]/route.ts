import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { AiReviewAction } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { reviewId } = await params;
  let body: { workspaceId?: string; action?: AiReviewAction; note?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "workspaceId and action (approve|reject) are required" } },
      { status: 400 },
    );
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const review = await api.reviewAiReview(body.workspaceId, reviewId, body.action, body.note);
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to review request" } }, { status: 500 });
  }
}
