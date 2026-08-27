import type { EventBus, DomainEvent } from "../kernel/events";
import type { Content } from "../content/types";
import type { SearchDocument, SearchProvider } from "./types";

export function docId(content: Content): string {
  return `${content.id}:${content.locale}`;
}

export function toDocument(content: Content): SearchDocument {
  return {
    id: docId(content),
    workspaceId: content.workspaceId,
    locale: content.locale,
    type: "content",
    title: content.title,
    text: [content.body, content.excerpt ?? ""].filter(Boolean).join(" "),
    status: content.status,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    fields: {
      contentId: content.id,
      contentType: content.type,
      status: content.status,
      locale: content.locale,
      authorId: content.authorId,
      categoryIds: content.categoryIds,
      tagIds: content.tagIds,
    },
    payload: { contentId: content.id, locale: content.locale },
  };
}

const INDEX_EVENTS = ["content.created", "content.updated", "content.published", "content.translated"];
const REMOVE_EVENTS = ["content.deleted"];

export class IndexingHooks {
  constructor(private provider: SearchProvider) {}

  attach(bus: EventBus): void {
    for (const type of INDEX_EVENTS) {
      bus.on(type, (event) => this.index(event));
    }
    for (const type of REMOVE_EVENTS) {
      bus.on(type, (event) => this.remove(event));
    }
  }

  private index(event: DomainEvent): void {
    const content = event.payload?.content as Content | undefined;
    if (!content) return;
    this.provider.index(toDocument(content));
  }

  private remove(event: DomainEvent): void {
    const content = event.payload?.content as Content | undefined;
    if (!content) return;
    this.provider.remove(docId(content));
  }
}
