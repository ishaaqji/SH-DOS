import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL, SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string } = {};
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const email = (body.email ?? "").trim();
  if (!email) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Email is required" } },
      { status: 400 },
    );
  }

  const api = createApiClient({ baseUrl: BACKEND_URL });
  try {
    const result = await api.login(email, body.password ?? "");
    const store = await cookies();
    store.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    if (result.workspaces[0]) {
      store.set(WORKSPACE_COOKIE, result.workspaces[0].id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return NextResponse.json({ user: result.user, workspaces: result.workspaces });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Login failed" } },
      { status: 500 },
    );
  }
}
