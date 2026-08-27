import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";
import type { ContentPatch } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { contentId } = await params;
  let body: { workspaceId?: string; patch?: ContentPatch } = {};
  try {
    body = (await request.json()) as { workspaceId?: string; patch?: ContentPatch };
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId || !body.patch) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and patch are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const content = await api.updateContent(body.workspaceId, contentId, body.patch);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update content" } }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ contentId: string }> },
) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { contentId } = await params;
  let body: { workspaceId?: string } = {};
  try {
    body = (await request.json()) as { workspaceId?: string };
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!body.workspaceId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId is required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const content = await api.deleteContent(body.workspaceId, contentId);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete content" } }, { status: 500 });
  }
}
