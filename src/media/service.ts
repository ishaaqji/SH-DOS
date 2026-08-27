import { type Store } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import { NotFoundError } from "../kernel/errors";
import type { IdentityService, User } from "../identity/identity";
import type { MediaReference } from "../content/types";
import type { Storage } from "./storage";
import { validateUpload } from "./validation";
import { imageSize } from "./metadata";

export interface MediaUploadInput {
  filename?: string;
  alt?: string;
  usage?: "featured" | "attachment";
  contentId?: string;
  mimeType?: string;
}

export interface MediaServiceDeps {
  storage: Storage;
  media: Store<MediaReference>;
  identity: IdentityService;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
};

const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime]),
);

export class MediaService {
  constructor(private deps: MediaServiceDeps) {}

  async upload(
    user: User,
    workspaceId: string,
    buffer: Buffer,
    input: MediaUploadInput = {},
  ): Promise<MediaReference> {
    this.deps.identity.authorize(user, workspaceId, "media", "create");
    const { mimeType, kind, sizeBytes } = validateUpload(buffer, input.mimeType);
    const key = `${workspaceId}/${newId("med")}${EXTENSIONS[mimeType] ?? ""}`;
    await this.deps.storage.put(key, buffer, mimeType);
    const meta = kind === "image" ? imageSize(buffer) : undefined;
    const media: MediaReference = {
      id: newId("med"),
      workspaceId,
      kind,
      url: this.deps.storage.url(key),
      alt: input.alt,
      mimeType,
      sizeBytes,
      width: meta?.width,
      height: meta?.height,
      contentId: input.contentId,
      usage: input.usage ?? "attachment",
      createdAt: now(),
      updatedAt: now(),
    };
    return this.deps.media.insert(media);
  }

  get(workspaceId: string, mediaId: string): MediaReference {
    const media = this.deps.media.require(mediaId);
    if (media.workspaceId !== workspaceId) throw new NotFoundError(`Media ${mediaId} not found`);
    return media;
  }

  async blob(media: MediaReference): Promise<{ data: Buffer; contentType: string } | undefined> {
    const key = media.url.replace(/^\/media\//, "");
    const data = await this.deps.storage.get(key);
    if (!data) return undefined;
    const ext = key.slice(key.lastIndexOf("."));
    const contentType = media.mimeType ?? MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
    return { data, contentType };
  }

  list(workspaceId: string): MediaReference[] {
    return this.deps.media.find((m) => m.workspaceId === workspaceId);
  }

  update(
    user: User,
    workspaceId: string,
    mediaId: string,
    patch: { alt?: string; usage?: "featured" | "attachment"; contentId?: string },
  ): MediaReference {
    this.deps.identity.authorize(user, workspaceId, "media", "update");
    const media = this.get(workspaceId, mediaId);
    const next: Partial<MediaReference> = {};
    if (patch.alt !== undefined) next.alt = patch.alt;
    if (patch.usage !== undefined) next.usage = patch.usage;
    if (patch.contentId !== undefined) next.contentId = patch.contentId;
    return this.deps.media.update(mediaId, next);
  }

  async replace(
    user: User,
    workspaceId: string,
    mediaId: string,
    buffer: Buffer,
    input: MediaUploadInput = {},
  ): Promise<MediaReference> {
    this.deps.identity.authorize(user, workspaceId, "media", "update");
    const media = this.get(workspaceId, mediaId);
    const { mimeType, kind, sizeBytes } = validateUpload(buffer, input.mimeType);
    const key = media.url.replace(/^\/media\//, "");
    await this.deps.storage.put(key, buffer, mimeType);
    const meta = kind === "image" ? imageSize(buffer) : undefined;
    const next: Partial<MediaReference> = {
      kind,
      mimeType,
      sizeBytes,
      width: meta?.width,
      height: meta?.height,
    };
    if (input.alt !== undefined) next.alt = input.alt;
    if (input.usage !== undefined) next.usage = input.usage;
    if (input.contentId !== undefined) next.contentId = input.contentId;
    return this.deps.media.update(mediaId, next);
  }

  async delete(user: User, workspaceId: string, mediaId: string): Promise<MediaReference> {
    this.deps.identity.authorize(user, workspaceId, "media", "delete");
    const media = this.get(workspaceId, mediaId);
    this.deps.media.softDelete(mediaId);
    const key = media.url.replace(/^\/media\//, "");
    await this.deps.storage.delete(key).catch(() => undefined);
    return media;
  }
}
