import { cookies } from "next/headers";
import { createApiClient, type ApiClient } from "./api";
import { BACKEND_URL, SESSION_COOKIE, WORKSPACE_COOKIE } from "./constants";
import type { MeResult, User, Workspace } from "./types";

export { roleFor } from "./nav";

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSession(): Promise<MeResult | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const api = createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
  try {
    return await api.me();
  } catch {
    return null;
  }
}

export async function getServerApi(): Promise<ApiClient | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return createApiClient({ baseUrl: BACKEND_URL, getToken: () => token });
}

export async function getCurrentWorkspace(user: User, workspaces: Workspace[]): Promise<Workspace> {
  const store = await cookies();
  const preferred = store.get(WORKSPACE_COOKIE)?.value;
  const match = workspaces.find((w) => w.id === preferred);
  if (match) return match;
  const first = workspaces[0];
  if (first) return first;
  throw new Error("User has no workspaces");
}
