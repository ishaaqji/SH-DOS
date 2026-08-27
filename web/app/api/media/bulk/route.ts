import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; ids?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const { workspaceId, ids } = body;
  if (!workspaceId || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and ids are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  try {
    for (const id of ids) {
      try {
        await api.deleteMedia(workspaceId, id);
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
