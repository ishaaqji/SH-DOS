import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { createApiClient, ApiError } from "@/lib/api";
import { BACKEND_URL } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 });
  }

  const { mediaId } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Expected multipart form data" } }, { status: 400 });
  }

  const workspaceId = String(form.get("workspaceId") ?? "");
  const file = form.get("file");
  if (!workspaceId || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId and a file are required" } }, { status: 400 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const alt = form.get("alt") ? String(form.get("alt")) : undefined;
  const usageRaw = form.get("usage");
  const usage = usageRaw === "featured" || usageRaw === "attachment" ? usageRaw : undefined;

  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    const media = await api.replaceMedia(workspaceId, mediaId, buffer, {
      filename: file.name,
      alt,
      usage,
      mimeType: file.type || undefined,
    });
    return NextResponse.json({ media });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to replace media" } }, { status: 500 });
  }
}
