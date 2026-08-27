import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionToken } from "@/lib/session";
import { createApiClient } from "@/lib/api";
import { BACKEND_URL, SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }
  let body: { workspaceId?: string } = {};
  try {
    body = (await request.json()) as { workspaceId?: string };
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const workspaceId = body.workspaceId;
  if (!workspaceId) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId is required" } }, { status: 400 });
  }

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const { workspaces } = await api.me();
    const valid = workspaces.some((w) => w.id === workspaceId);
    if (!valid) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not a member of this workspace" } }, { status: 403 });
    }
    const store = await cookies();
    store.set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return NextResponse.json({ ok: true, workspaceId });
  } catch {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Session expired" } }, { status: 401 });
  }
}
