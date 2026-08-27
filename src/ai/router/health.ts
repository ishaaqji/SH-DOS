export interface HealthEntry {
  ok: boolean;
  latencyMs?: number;
  checkedAt: number;
}

export class ProviderHealthMonitor {
  private cache = new Map<string, HealthEntry>();

  constructor(private ttlMs = 10_000) {}

  private key(workspaceId: string, providerId: string): string {
    return `${workspaceId}:${providerId}`;
  }

  async isHealthy(
    workspaceId: string,
    providerId: string,
    ping: () => Promise<boolean>,
  ): Promise<boolean> {
    const entry = this.cache.get(this.key(workspaceId, providerId));
    if (entry && Date.now() - entry.checkedAt < this.ttlMs) return entry.ok;
    const ok = await ping();
    this.set(workspaceId, providerId, ok);
    return ok;
  }

  set(workspaceId: string, providerId: string, ok: boolean, latencyMs?: number): void {
    this.cache.set(this.key(workspaceId, providerId), {
      ok,
      latencyMs,
      checkedAt: Date.now(),
    });
  }

  get(workspaceId: string, providerId: string): HealthEntry | undefined {
    return this.cache.get(this.key(workspaceId, providerId));
  }
}
