import { type Store } from "../kernel/store";
import { newId, now } from "../kernel/ids";
import type { Content, ContentVersion } from "./types";

export function takeSnapshot(
  versions: Store<ContentVersion>,
  content: Content,
  changeSummary?: string,
  changedBy?: string,
): ContentVersion {
  const current = versions.find((v) => v.contentId === content.id);
  const versionNumber = current.length > 0
    ? Math.max(...current.map((v) => v.versionNumber)) + 1
    : 1;
  const version: ContentVersion = {
    id: newId("ver"),
    contentId: content.id,
    versionNumber,
    title: content.title,
    slug: content.slug,
    body: content.body,
    excerpt: content.excerpt,
    status: content.status,
    seo: { ...content.seo },
    changeSummary,
    changedBy,
    createdAt: now(),
    updatedAt: now(),
  };
  return versions.insert(version);
}
