import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, WORKSPACE_COOKIE } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(WORKSPACE_COOKIE);
  return NextResponse.json({ ok: true });
}
