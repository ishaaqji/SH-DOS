export interface DomainEvent {
  type: string;
  aggregateId?: string;
  workspaceId?: string;
  at: Date;
  payload?: Record<string, unknown>;
}

export type Listener = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(type: string, listener: Listener): () => void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
    return () => {
      set.delete(listener);
    };
  }

  async emit(event: DomainEvent): Promise<void> {
    const handlers = new Set<Listener>();
    for (const l of this.listeners.get(event.type) ?? []) handlers.add(l);
    for (const l of this.listeners.get("*") ?? []) handlers.add(l);
    for (const handler of handlers) {
      await handler(event);
    }
  }
}
