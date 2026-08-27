import type { EventBus } from "../kernel/events";
import { type Store } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import { NotFoundError, ValidationError } from "../kernel/errors";
import type { LanguageRegistry } from "./language";
import type { User } from "../identity/identity";
import { takeSnapshot } from "./versions";
import type { Content, ContentVersion, Translation, TranslationStatus } from "./types";

export type TranslateFn = (text: string, from: string, to: string) => Promise<string>;

export const defaultTranslate: TranslateFn = async (text, _from, to) =>
  `[${to}] ${text}`;

export const TRANSLATION_FLOW: Record<TranslationStatus, TranslationStatus[]> = {
  auto: ["needs_review", "in_review"],
  needs_review: ["in_review"],
  in_review: ["needs_review", "approved"],
  approved: [],
};

export interface TranslationServiceDeps {
  bus: EventBus;
  contents: Store<Content>;
  versions: Store<ContentVersion>;
  translations: Store<Translation>;
  registry: LanguageRegistry;
  translateText?: TranslateFn;
}

export class TranslationService {
  private translateText: TranslateFn;

  constructor(private deps: TranslationServiceDeps) {
    this.translateText = deps.translateText ?? defaultTranslate;
    deps.bus.on("translation.requested", (e) => this.handleRequest(e));
  }

  private async handleRequest(e: {
    type: string;
    aggregateId?: string;
    workspaceId?: string;
    at: Date;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { workspaceId, contentId, locale } = e.payload ?? {};
    if (typeof contentId !== "string" || typeof locale !== "string") return;
    const source = this.deps.contents.get(contentId);
    if (!source || source.workspaceId !== workspaceId) return;
    if (!this.deps.registry.get(locale)?.isActive) return;
    await this.createTranslationFor(source, locale);
  }

  private groupIdOf(source: Content): string {
    return source.translationGroupId ?? source.id;
  }

  private findTranslation(groupId: string, locale: string): Translation | undefined {
    return this.deps.translations.find((t) => t.translationGroupId === groupId && t.locale === locale)[0];
  }

  async createTranslationFor(source: Content, locale: string): Promise<Translation> {
    const groupId = this.groupIdOf(source);
    const existing = this.findTranslation(groupId, locale);
    if (existing) return existing;
    const target = await this.ensureTarget(source, locale);
    const translation: Translation = {
      id: newId("trn"),
      workspaceId: source.workspaceId,
      translationGroupId: groupId,
      sourceContentId: source.id,
      targetContentId: target.id,
      locale,
      status: "auto",
      createdAt: now(),
      updatedAt: now(),
    };
    this.deps.translations.insert(translation);
    await this.deps.bus.emit({
      type: "translation.created",
      aggregateId: translation.id,
      workspaceId: translation.workspaceId,
      at: new Date(),
      payload: { translation },
    });
    return translation;
  }

  private async ensureTarget(source: Content, locale: string): Promise<Content> {
    const groupId = this.groupIdOf(source);
    const existing = this.deps.contents.find(
      (c) => c.translationGroupId === groupId && c.locale === locale,
    );
    if (existing.length > 0) return existing[0];

    const title = await this.translateText(source.title, source.locale, locale);
    const excerpt = source.excerpt
      ? await this.translateText(source.excerpt, source.locale, locale)
      : undefined;
    const body = source.body
      ? await this.translateText(source.body, source.locale, locale)
      : "";
    const target: Content = {
      id: newId("con"),
      workspaceId: source.workspaceId,
      type: source.type,
      title,
      slug: source.slug,
      body,
      excerpt,
      status: "draft",
      authorId: source.authorId,
      categoryIds: [...source.categoryIds],
      tagIds: [...source.tagIds],
      featuredImageId: source.featuredImageId,
      attachmentIds: [...source.attachmentIds],
      locale,
      translationGroupId: groupId,
      sourceContentId: source.id,
      seo: { ...source.seo, title },
      canonicalUrl: source.canonicalUrl,
      createdAt: now(),
      updatedAt: now(),
    };
    this.deps.contents.insert(target);
    takeSnapshot(this.deps.versions, target, "Auto-created from translation");
    await this.deps.bus.emit({
      type: "content.translated",
      aggregateId: target.id,
      workspaceId: target.workspaceId,
      at: new Date(),
      payload: { content: target },
    });
    return target;
  }

  async requestTranslation(
    _user: User,
    workspaceId: string,
    sourceContentId: string,
    locale: string,
  ): Promise<Translation> {
    this.deps.registry.require(locale);
    const source = this.deps.contents.require(sourceContentId);
    if (source.workspaceId !== workspaceId) {
      throw new NotFoundError(`Content ${sourceContentId} not found`);
    }
    const existing = this.findTranslation(this.groupIdOf(source), locale);
    if (existing) return existing;
    const translation = await this.createTranslationFor(source, locale);
    await this.deps.bus.emit({
      type: "translation.requested",
      aggregateId: source.id,
      workspaceId,
      at: new Date(),
      payload: { workspaceId, contentId: source.id, locale },
    });
    return translation;
  }

  listForContent(workspaceId: string, contentId: string): Translation[] {
    const content = this.deps.contents.require(contentId);
    if (content.workspaceId !== workspaceId) throw new NotFoundError(`Content ${contentId} not found`);
    const groupId = this.groupIdOf(content);
    return this.deps.translations.find((t) => t.translationGroupId === groupId);
  }

  review(
    user: User,
    workspaceId: string,
    translationId: string,
    action: "approve" | "request_changes" | "mark_review",
  ): Translation {
    const translation = this.deps.translations.require(translationId);
    if (translation.workspaceId !== workspaceId) {
      throw new NotFoundError(`Translation ${translationId} not found`);
    }
    const next: TranslationStatus =
      action === "approve" ? "approved" : action === "mark_review" ? "in_review" : "needs_review";
    const allowed = TRANSLATION_FLOW[translation.status];
    if (!allowed.includes(next)) {
      throw new ValidationError(
        `Cannot transition translation from ${translation.status} to ${next}`,
      );
    }
    const patch: Partial<Translation> = { status: next };
    if (next === "approved") {
      patch.reviewedAt = now();
      patch.reviewedBy = user.id;
    }
    const updated = this.deps.translations.update(translationId, patch);
    if (next === "approved") {
      void this.deps.bus.emit({
        type: "translation.approved",
        aggregateId: updated.id,
        workspaceId: updated.workspaceId,
        at: new Date(),
        payload: { translation: updated },
      });
    }
    return updated;
  }
}
