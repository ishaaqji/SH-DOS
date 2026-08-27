import type { EventBus } from "../kernel/events";
import { type Store } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import { NotFoundError, ValidationError } from "../kernel/errors";
import { paginate, parsePageQuery, sortBy, type PageQuery, type PageResult } from "../kernel/pagination";
import { IdentityService, type User } from "../identity/identity";
import { LanguageRegistry } from "./language";
import { ensureUniqueSlug, slugify } from "./slug";
import { findTransition } from "./workflow";
import type { WorkflowStatus } from "./types";
import { takeSnapshot } from "./versions";
import { TranslationService } from "./translation";
import { buildQuery } from "../search/parser";
import type { SearchQuery, SearchResult, SearchDocument } from "../search/types";
import type {
  Author,
  Category,
  Content,
  ContentType,
  ContentVersion,
  MediaKind,
  MediaReference,
  SeoMetadata,
  Tag,
  Translation,
} from "./types";

export const CONTENT_TYPES: ContentType[] = [
  "article", "news", "video", "page", "business_listing",
  "knowledge_base", "temple", "course", "event",
];

export interface ContentInput {
  type: ContentType;
  title: string;
  body?: string;
  excerpt?: string;
  slug?: string;
  authorId?: string;
  categoryIds?: string[];
  tagIds?: string[];
  featuredImageId?: string;
  attachmentIds?: string[];
  locale?: string;
  seo?: Partial<SeoMetadata>;
  canonicalUrl?: string;
  scheduledAt?: string;
}

export interface ContentPatch {
  title?: string;
  body?: string;
  excerpt?: string;
  slug?: string;
  authorId?: string;
  categoryIds?: string[];
  tagIds?: string[];
  featuredImageId?: string;
  attachmentIds?: string[];
  seo?: Partial<SeoMetadata>;
  canonicalUrl?: string;
  scheduledAt?: string;
  changeSummary?: string;
}

export interface ResolvedContent {
  content: Content;
  resolvedLocale: string;
  viaTranslation: boolean;
  fallback: boolean;
}

export interface ContentServiceDeps {
  identity: IdentityService;
  registry: LanguageRegistry;
  bus: EventBus;
  contents: Store<Content>;
  versions: Store<ContentVersion>;
  categories: Store<Category>;
  tags: Store<Tag>;
  authors: Store<Author>;
  media: Store<MediaReference>;
  translations: Store<Translation>;
  translationsService: TranslationService;
  searchIndex: SyncSearchProvider;
}

const CONTENT_SORT_FIELDS = [
  "title", "createdAt", "updatedAt", "publishedAt", "status", "locale",
] as const;

export interface SyncSearchProvider {
  index(doc: SearchDocument): void;
  remove(docId: string): void;
  search(query: SearchQuery): SearchResult;
}

export class ContentService {
  constructor(private deps: ContentServiceDeps) {}

  // ---------- Content lifecycle ----------

  create(user: User, workspaceId: string, input: ContentInput): Content {
    this.deps.identity.authorize(user, workspaceId, "content", "create");
    if (!CONTENT_TYPES.includes(input.type)) {
      throw new ValidationError(`Invalid content type ${input.type}`);
    }
    if (!input.title || !input.title.trim()) throw new ValidationError("title is required");
    const locale = input.locale ?? this.deps.registry.default().code;
    this.deps.registry.require(locale);
    const slug = ensureUniqueSlug(input.slug ?? slugify(input.title), (s) =>
      this.slugTaken(workspaceId, s),
    );
    const content: Content = {
      id: newId("con"),
      workspaceId,
      type: input.type,
      title: input.title.trim(),
      slug,
      body: input.body ?? "",
      excerpt: input.excerpt,
      status: "draft",
      authorId: input.authorId,
      categoryIds: input.categoryIds ?? [],
      tagIds: input.tagIds ?? [],
      featuredImageId: input.featuredImageId,
      attachmentIds: input.attachmentIds ?? [],
      locale,
      seo: { ...input.seo },
      canonicalUrl: input.canonicalUrl ?? this.canonicalUrl(workspaceId, locale, slug),
      scheduledAt: input.scheduledAt,
      publishedAt: undefined,
      createdAt: now(),
      updatedAt: now(),
      createdBy: user.id,
      updatedBy: user.id,
    };
    this.deps.contents.insert(content);
    takeSnapshot(this.deps.versions, content, "Created", user.id);
    void this.emit("content.created", content);
    return content;
  }

  update(user: User, workspaceId: string, contentId: string, patch: ContentPatch): Content {
    this.deps.identity.authorize(user, workspaceId, "content", "update");
    const content = this.requireInWorkspace(contentId, workspaceId);
    const next: Content = { ...content, updatedAt: now(), updatedBy: user.id };

    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ValidationError("title cannot be empty");
      next.title = patch.title.trim();
    }
    if (patch.body !== undefined) next.body = patch.body;
    if (patch.excerpt !== undefined) next.excerpt = patch.excerpt;
    if (patch.authorId !== undefined) next.authorId = patch.authorId;
    if (patch.categoryIds !== undefined) next.categoryIds = patch.categoryIds;
    if (patch.tagIds !== undefined) next.tagIds = patch.tagIds;
    if (patch.featuredImageId !== undefined) next.featuredImageId = patch.featuredImageId;
    if (patch.attachmentIds !== undefined) next.attachmentIds = patch.attachmentIds;
    if (patch.seo !== undefined) next.seo = { ...next.seo, ...patch.seo };
    if (patch.canonicalUrl !== undefined) next.canonicalUrl = patch.canonicalUrl;
    if (patch.scheduledAt !== undefined) {
      if (patch.scheduledAt === null || patch.scheduledAt === "") {
        next.scheduledAt = undefined;
      } else {
        if (Number.isNaN(Date.parse(patch.scheduledAt))) {
          throw new ValidationError("scheduledAt must be an ISO date string");
        }
        next.scheduledAt = new Date(patch.scheduledAt).toISOString();
      }
    }
    if (patch.slug !== undefined) {
      if (!patch.slug.trim()) throw new ValidationError("slug cannot be empty");
      const slug = ensureUniqueSlug(patch.slug, (s) =>
        s !== content.slug && this.slugTaken(workspaceId, s),
      );
      next.slug = slug;
      if (patch.canonicalUrl === undefined) next.canonicalUrl = this.canonicalUrl(workspaceId, next.locale, slug);
    }

    this.deps.contents.update(contentId, next);
    takeSnapshot(this.deps.versions, next, patch.changeSummary ?? "Updated", user.id);
    void this.emit("content.updated", next);
    return next;
  }

  transition(user: User, workspaceId: string, contentId: string, to: WorkflowStatus): Content {
    const content = this.requireInWorkspace(contentId, workspaceId);
    const transition = findTransition(content.status, to);
    if (!transition) {
      throw new ValidationError(`Cannot transition content from ${content.status} to ${to}`);
    }
    this.deps.identity.authorize(user, workspaceId, "content", transition.action);
    const patch: Partial<Content> = { status: to, updatedBy: user.id };
    if (to === "published") patch.publishedAt = content.publishedAt ?? now();
    if (to === "draft") patch.scheduledAt = undefined;
    const updated = this.deps.contents.update(contentId, patch);
    takeSnapshot(this.deps.versions, updated, `Transitioned to ${to}`, user.id);
    void this.emit("content.status_changed", updated);
    if (to === "published") void this.emit("content.published", updated);
    if (to === "archived") void this.emit("content.archived", updated);
    return updated;
  }

  schedule(user: User, workspaceId: string, contentId: string, scheduledAt: string): Content {
    this.deps.identity.authorize(user, workspaceId, "content", "update");
    if (Number.isNaN(Date.parse(scheduledAt))) {
      throw new ValidationError("scheduledAt must be an ISO date string");
    }
    const content = this.requireInWorkspace(contentId, workspaceId);
    const updated = this.deps.contents.update(contentId, {
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
    void this.emit("content.scheduled", updated);
    return updated;
  }

  runScheduler(at?: Date): Content[] {
    const cutoff = (at ?? new Date()).toISOString();
    const due = this.deps.contents.find(
      (c) =>
        c.scheduledAt !== undefined &&
        c.scheduledAt <= cutoff &&
        (c.status === "draft" || c.status === "approved"),
    );
    const published: Content[] = [];
    for (const content of due) {
      const updated = this.deps.contents.update(content.id, {
        status: "published",
        publishedAt: content.publishedAt ?? cutoff,
      });
      takeSnapshot(this.deps.versions, updated, "Scheduled publish", undefined);
      void this.emit("content.published", updated);
      published.push(updated);
    }
    return published;
  }

  delete(user: User, workspaceId: string, contentId: string): Content {
    this.deps.identity.authorize(user, workspaceId, "content", "delete");
    const content = this.requireInWorkspace(contentId, workspaceId);
    this.deps.contents.softDelete(contentId);
    void this.emit("content.deleted", content);
    return { ...content, deletedAt: now() };
  }

  restore(user: User, workspaceId: string, contentId: string): Content {
    this.deps.identity.authorize(user, workspaceId, "content", "update");
    const row = this.deps.contents.restore(contentId);
    if (row.workspaceId !== workspaceId) throw new NotFoundError(`Content ${contentId} not found`);
    void this.emit("content.restored", row);
    return row;
  }

  // ---------- Reading & resolution ----------

  resolve(workspaceId: string, contentId: string, locale?: string): ResolvedContent {
    const source = this.requireInWorkspace(contentId, workspaceId);
    return this.resolveWithLocale(source, locale);
  }

  getBySlug(workspaceId: string, slug: string, locale?: string): ResolvedContent {
    const source = this.deps.contents.find(
      (c) => c.workspaceId === workspaceId && c.slug === slug,
    )[0];
    if (!source) throw new NotFoundError(`Content with slug ${slug} not found`);
    return this.resolveWithLocale(source, locale);
  }

  private resolveWithLocale(source: Content, locale?: string): ResolvedContent {
    if (!locale || locale === source.locale) {
      return { content: source, resolvedLocale: source.locale, viaTranslation: false, fallback: false };
    }
    const groupId = source.translationGroupId ?? source.id;
    for (const code of this.deps.registry.fallbackChain(locale)) {
      const translation = this.deps.translations.find(
        (t) => t.translationGroupId === groupId && t.locale === code,
      )[0];
      if (translation) {
        const target = this.deps.contents.get(translation.targetContentId);
        if (target) {
          return {
            content: target,
            resolvedLocale: code,
            viaTranslation: true,
            fallback: code !== locale,
          };
        }
      }
    }
    return { content: source, resolvedLocale: source.locale, viaTranslation: false, fallback: true };
  }

  list(workspaceId: string, query: PageQuery): PageResult<Content> {
    let items = this.deps.contents.list().filter((c) => c.workspaceId === workspaceId);

    if (query.search) {
      const locale = query.filters.locale as string | undefined;
      const searchQuery = buildQuery(query.search, {
        locale,
        limit: 1000,
        offset: 0,
        filters: [{ field: "workspaceId", op: "eq", value: workspaceId }],
      });
      const result = this.deps.searchIndex.search(searchQuery);
      const ids = new Set(result.hits.map((hit) => hit.doc.fields.contentId as string));
      items = items.filter((c) => ids.has(c.id));
    }

    const { filters } = query;
    if (filters.type) {
      const types = String(filters.type).split(",");
      items = items.filter((c) => types.includes(c.type));
    }
    if (filters.status) {
      const statuses = String(filters.status).split(",");
      items = items.filter((c) => statuses.includes(c.status));
    }
    if (filters.locale) items = items.filter((c) => c.locale === filters.locale);
    if (filters.category) items = items.filter((c) => c.categoryIds.includes(filters.category as string));
    if (filters.tag) items = items.filter((c) => c.tagIds.includes(filters.tag as string));
    if (filters.author) items = items.filter((c) => c.authorId === filters.author);

    items = sortBy(items, query.sort, CONTENT_SORT_FIELDS as unknown as (keyof Content)[]);
    return paginate(items, query);
  }

  versions(contentId: string): ContentVersion[] {
    return this.deps.versions
      .find((v) => v.contentId === contentId)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  getVersion(contentId: string, versionNumber: number): ContentVersion {
    const version = this.deps.versions.find(
      (v) => v.contentId === contentId && v.versionNumber === versionNumber,
    )[0];
    if (!version) throw new NotFoundError(`Version ${versionNumber} not found for ${contentId}`);
    return version;
  }

  // ---------- Translations ----------

  requestTranslation(user: User, workspaceId: string, contentId: string, locale: string): Promise<Translation> {
    this.deps.identity.authorize(user, workspaceId, "content", "translate");
    return this.deps.translationsService.requestTranslation(user, workspaceId, contentId, locale);
  }

  translations(workspaceId: string, contentId: string): Translation[] {
    return this.deps.translationsService.listForContent(workspaceId, contentId);
  }

  reviewTranslation(
    user: User,
    workspaceId: string,
    translationId: string,
    action: "approve" | "request_changes" | "mark_review",
  ): Translation {
    this.deps.identity.authorize(user, workspaceId, "translation", "review");
    return this.deps.translationsService.review(user, workspaceId, translationId, action);
  }

  // ---------- Taxonomy: categories ----------

  createCategory(user: User, workspaceId: string, input: { type?: ContentType; name: string; slug?: string; parentId?: string; description?: string }): Category {
    this.deps.identity.authorize(user, workspaceId, "category", "create");
    if (!input.name?.trim()) throw new ValidationError("name is required");
    const slug = ensureUniqueSlug(input.slug ?? slugify(input.name), (s) =>
      this.deps.categories.find((c) => c.workspaceId === workspaceId && c.slug === s).length > 0,
    );
    const category: Category = {
      id: newId("cat"),
      workspaceId,
      type: input.type,
      name: input.name.trim(),
      slug,
      parentId: input.parentId,
      description: input.description,
      createdAt: now(),
      updatedAt: now(),
    };
    return this.deps.categories.insert(category);
  }

  listCategories(workspaceId: string, type?: ContentType): Category[] {
    return this.deps.categories.find(
      (c) => c.workspaceId === workspaceId && (!type || c.type === type),
    );
  }

  getCategory(workspaceId: string, categoryId: string): Category {
    const category = this.deps.categories.require(categoryId);
    if (category.workspaceId !== workspaceId) throw new NotFoundError(`Category ${categoryId} not found`);
    return category;
  }

  updateCategory(user: User, workspaceId: string, categoryId: string, patch: { name?: string; slug?: string; description?: string; parentId?: string }): Category {
    this.deps.identity.authorize(user, workspaceId, "category", "update");
    const category = this.getCategory(workspaceId, categoryId);
    return this.deps.categories.update(categoryId, { ...patch });
  }

  deleteCategory(user: User, workspaceId: string, categoryId: string): Category {
    this.deps.identity.authorize(user, workspaceId, "category", "delete");
    this.getCategory(workspaceId, categoryId);
    return this.deps.categories.softDelete(categoryId);
  }

  // ---------- Taxonomy: tags ----------

  createTag(user: User, workspaceId: string, input: { name: string; slug?: string }): Tag {
    this.deps.identity.authorize(user, workspaceId, "tag", "create");
    if (!input.name?.trim()) throw new ValidationError("name is required");
    const slug = ensureUniqueSlug(input.slug ?? slugify(input.name), (s) =>
      this.deps.tags.find((t) => t.workspaceId === workspaceId && t.slug === s).length > 0,
    );
    const tag: Tag = {
      id: newId("tag"),
      workspaceId,
      name: input.name.trim(),
      slug,
      createdAt: now(),
      updatedAt: now(),
    };
    return this.deps.tags.insert(tag);
  }

  listTags(workspaceId: string): Tag[] {
    return this.deps.tags.find((t) => t.workspaceId === workspaceId);
  }

  getTag(workspaceId: string, tagId: string): Tag {
    const tag = this.deps.tags.require(tagId);
    if (tag.workspaceId !== workspaceId) throw new NotFoundError(`Tag ${tagId} not found`);
    return tag;
  }

  updateTag(user: User, workspaceId: string, tagId: string, patch: { name?: string; slug?: string }): Tag {
    this.deps.identity.authorize(user, workspaceId, "tag", "update");
    this.getTag(workspaceId, tagId);
    return this.deps.tags.update(tagId, { ...patch });
  }

  deleteTag(user: User, workspaceId: string, tagId: string): Tag {
    this.deps.identity.authorize(user, workspaceId, "tag", "delete");
    this.getTag(workspaceId, tagId);
    return this.deps.tags.softDelete(tagId);
  }

  // ---------- Authors ----------

  createAuthor(user: User, workspaceId: string, input: { name: string; email?: string; bio?: string; avatarUrl?: string }): Author {
    this.deps.identity.authorize(user, workspaceId, "author", "create");
    if (!input.name?.trim()) throw new ValidationError("name is required");
    const author: Author = {
      id: newId("aut"),
      workspaceId,
      name: input.name.trim(),
      email: input.email,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      createdAt: now(),
      updatedAt: now(),
    };
    return this.deps.authors.insert(author);
  }

  listAuthors(workspaceId: string): Author[] {
    return this.deps.authors.find((a) => a.workspaceId === workspaceId);
  }

  getAuthor(workspaceId: string, authorId: string): Author {
    const author = this.deps.authors.require(authorId);
    if (author.workspaceId !== workspaceId) throw new NotFoundError(`Author ${authorId} not found`);
    return author;
  }

  // ---------- Media ----------

  listLanguages() {
    return this.deps.registry.list();
  }

  registerLanguage(input: { code: string; name: string; nativeName?: string; locale?: string }) {
    return this.deps.registry.register(input);
  }

  createMedia(
    user: User,
    workspaceId: string,
    input: { kind: MediaKind; url: string; alt?: string; mimeType?: string; sizeBytes?: number; width?: number; height?: number; usage?: "featured" | "attachment"; contentId?: string },
  ): MediaReference {
    this.deps.identity.authorize(user, workspaceId, "media", "create");
    if (!input.url?.trim()) throw new ValidationError("url is required");
    const media: MediaReference = {
      id: newId("med"),
      workspaceId,
      kind: input.kind,
      url: input.url,
      alt: input.alt,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      contentId: input.contentId,
      usage: input.usage ?? "attachment",
      createdAt: now(),
      updatedAt: now(),
    };
    return this.deps.media.insert(media);
  }

  listMedia(workspaceId: string): MediaReference[] {
    return this.deps.media.find((m) => m.workspaceId === workspaceId);
  }

  getMedia(workspaceId: string, mediaId: string): MediaReference {
    const media = this.deps.media.require(mediaId);
    if (media.workspaceId !== workspaceId) throw new NotFoundError(`Media ${mediaId} not found`);
    return media;
  }

  deleteMedia(user: User, workspaceId: string, mediaId: string): MediaReference {
    this.deps.identity.authorize(user, workspaceId, "media", "delete");
    this.getMedia(workspaceId, mediaId);
    return this.deps.media.softDelete(mediaId);
  }

  // ---------- Internal helpers ----------

  private requireInWorkspace(contentId: string, workspaceId: string): Content {
    const content = this.deps.contents.require(contentId);
    if (content.workspaceId !== workspaceId) throw new NotFoundError(`Content ${contentId} not found`);
    return content;
  }

  private slugTaken(workspaceId: string, slug: string): boolean {
    return this.deps.contents.find(
      (c) => c.workspaceId === workspaceId && c.slug === slug,
    ).length > 0;
  }

  private canonicalUrl(workspaceId: string, locale: string, slug: string): string | undefined {
    const workspace = this.deps.identity.getWorkspace(workspaceId);
    if (!workspace.baseUrl) return undefined;
    return `${workspace.baseUrl.replace(/\/+$/, "")}/${locale}/${slug}`;
  }

  private emit(type: string, content: Content): Promise<void> {
    return this.deps.bus.emit({
      type,
      aggregateId: content.id,
      workspaceId: content.workspaceId,
      at: new Date(),
      payload: { content },
    });
  }
}
