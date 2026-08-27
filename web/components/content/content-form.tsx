"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/input";
import { Icon } from "../ui/icons";
import { CONTENT_TYPES, STATUS_ORDER } from "@/lib/status";
import type { Author, Category, Content, Language, Tag } from "@/lib/types";

interface ContentFormProps {
  workspaceId: string;
  categories: Category[];
  tags: Tag[];
  authors: Author[];
  languages: Language[];
  content?: Content;
  contentId?: string;
}

export function ContentForm({
  workspaceId,
  categories,
  tags,
  authors,
  languages,
  content,
  contentId,
}: ContentFormProps) {
  const router = useRouter();
  const isEdit = Boolean(content);

  const [title, setTitle] = useState(content?.title ?? "");
  const [type, setType] = useState(content?.type ?? "article");
  const [slug, setSlug] = useState(content?.slug ?? "");
  const [excerpt, setExcerpt] = useState(content?.excerpt ?? "");
  const [body, setBody] = useState(content?.body ?? "");
  const [authorId, setAuthorId] = useState(content?.authorId ?? "");
  const [locale, setLocale] = useState(content?.locale ?? languages[0]?.code ?? "en");
  const [categoryIds, setCategoryIds] = useState<string[]>(content?.categoryIds ?? []);
  const [tagIds, setTagIds] = useState<string[]>(content?.tagIds ?? []);
  const [status, setStatus] = useState(content?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const input = {
      type: type as Content["type"],
      title,
      body,
      excerpt: excerpt || undefined,
      slug: slug || undefined,
      authorId: authorId || undefined,
      categoryIds,
      tagIds,
      locale,
    };

    try {
      const res = isEdit
        ? await fetch(`/api/content/${encodeURIComponent(contentId!)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId, patch: input }),
          })
        : await fetch("/api/content", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId, input }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Save failed");
      router.push("/dashboard/content");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const transition = async (to: string) => {
    if (!contentId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(contentId)}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Transition failed");
      setStatus(to as Content["status"]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="content-form" onSubmit={submit}>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <div className="content-form-grid">
        <div className="content-form-main">
          <Field label="Title" htmlFor="cf-title">
            <Input
              id="cf-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title"
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="cf-slug"
            hint="Leave empty to generate from the title."
          >
            <Input
              id="cf-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated"
            />
          </Field>

          <Field label="Excerpt" htmlFor="cf-excerpt">
            <textarea
              id="cf-excerpt"
              className="input textarea"
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short summary shown in lists and teasers"
            />
          </Field>

          <Field label="Body" htmlFor="cf-body">
            <textarea
              id="cf-body"
              className="input textarea"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your content here (plain text)."
            />
          </Field>
        </div>

        <div className="content-form-side">
          <div className="content-form-section">
            <h4 className="content-form-section-title">Details</h4>
            <Field label="Type" htmlFor="cf-type">
              <select
                id="cf-type"
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value as Content["type"])}
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>

            {languages.length > 0 && (
              <Field label="Locale" htmlFor="cf-locale">
                <select
                  id="cf-locale"
                  className="select"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {languages.map((language) => (
                    <option key={language.id} value={language.code}>
                      {language.name} ({language.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Author" htmlFor="cf-author">
              <select
                id="cf-author"
                className="select"
                value={authorId}
                onChange={(e) => setAuthorId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.name}
                  </option>
                ))}
              </select>
            </Field>

            {isEdit && (
              <Field label="Status" htmlFor="cf-status" hint="Save to persist other changes first.">
                <select
                  id="cf-status"
                  className="select"
                  value={status}
                  onChange={(e) => {
                    const to = e.target.value;
                    if (to !== status) void transition(to);
                  }}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {categories.length > 0 && (
            <div className="content-form-section">
              <h4 className="content-form-section-title">Categories</h4>
              <div className="content-form-picks">
                {categories.map((category) => (
                  <label key={category.id} className="content-pick">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggle(category.id, categoryIds, setCategoryIds)}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="content-form-section">
              <h4 className="content-form-section-title">Tags</h4>
              <div className="content-form-picks">
                {tags.map((tag) => (
                  <label key={tag.id} className="content-pick">
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={() => toggle(tag.id, tagIds, setTagIds)}
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="content-form-actions">
        <Button type="button" variant="secondary" onClick={() => router.push("/dashboard/content")}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          <Icon name="check" size={15} />
          {isEdit ? "Save changes" : "Create content"}
        </Button>
      </div>
    </form>
  );
}
