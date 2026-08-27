import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";

export const runtime = "nodejs";

type Kind = "category" | "tag";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: {
    workspaceId?: string;
    kind?: Kind;
    name?: string;
    slug?: string;
    type?: string;
    description?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const { workspaceId, kind, name, slug, type, description } = body;
  if (!workspaceId || !kind || !name) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId, kind and name are required" } }, { status: 400 });
  }
  if (kind !== "category" && kind !== "tag") {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "kind must be category or tag" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    if (kind === "category") {
      const category = await api.createCategory(workspaceId, {
        name,
        slug,
        type: type as never,
        description,
      });
      return NextResponse.json({ category });
    }
    const tag = await api.createTag(workspaceId, { name, slug });
    return NextResponse.json({ tag });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create" } }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  let body: { workspaceId?: string; kind?: Kind; id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const { workspaceId, kind, id } = body;
  if (!workspaceId || !kind || !id) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId, kind and id are required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    if (kind === "category") {
      const category = await api.deleteCategory(workspaceId, id);
      return NextResponse.json({ category });
    }
    const tag = await api.deleteTag(workspaceId, id);
    return NextResponse.json({ tag });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete" } }, { status: 500 });
  }
}
