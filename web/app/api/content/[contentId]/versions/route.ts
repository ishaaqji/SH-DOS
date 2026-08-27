import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { contentId } = await params;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId is required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const versions = await api.contentVersions(workspaceId, contentId);
    return NextResponse.json({ versions });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to load versions" } }, { status: 500 });
  }
}
