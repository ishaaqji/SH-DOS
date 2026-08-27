"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/input";
import { Icon } from "../ui/icons";
import type { Category, Tag } from "@/lib/types";

interface TaxonomyManagerProps {
  workspaceId: string;
  categories: Category[];
  tags: Tag[];
}

export function TaxonomyManager({ workspaceId, categories, tags }: TaxonomyManagerProps) {
  const router = useRouter();
  const [categoryName, setCategoryName] = useState("");
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    method: "POST" | "DELETE",
    body: { kind: "category" | "tag"; name?: string; id?: string },
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/taxonomy", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addCategory = (e: FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    void run("POST", { kind: "category", name: categoryName.trim() });
    setCategoryName("");
  };

  const addTag = (e: FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    void run("POST", { kind: "tag", name: tagName.trim() });
    setTagName("");
  };

  return (
    <div className="taxonomy-grid">
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <div className="taxonomy-panel">
        <div className="taxonomy-header">
          <Icon name="building" size={16} />
          <h4 className="taxonomy-title">Categories</h4>
          <span className="taxonomy-count">{categories.length}</span>
        </div>
        <form className="taxonomy-add" onSubmit={addCategory}>
          <Field label="New category">
            <div className="taxonomy-add-row">
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Politics"
              />
              <Button type="submit" size="sm" disabled={busy || !categoryName.trim()}>
                Add
              </Button>
            </div>
          </Field>
        </form>
        {categories.length === 0 ? (
          <p className="text-sm text-faint">No categories yet.</p>
        ) : (
          <ul className="taxonomy-list">
            {categories.map((category) => (
              <li key={category.id} className="taxonomy-item">
                <span className="taxonomy-name">{category.name}</span>
                <span className="taxonomy-meta mono">{category.slug}</span>
                <button
                  type="button"
                  className="taxonomy-delete"
                  aria-label={`Delete category ${category.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete category "${category.name}"?`)) {
                      void run("DELETE", { kind: "category", id: category.id });
                    }
                  }}
                >
                  <Icon name="logout" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="taxonomy-panel">
        <div className="taxonomy-header">
          <Icon name="content" size={16} />
          <h4 className="taxonomy-title">Tags</h4>
          <span className="taxonomy-count">{tags.length}</span>
        </div>
        <form className="taxonomy-add" onSubmit={addTag}>
          <Field label="New tag">
            <div className="taxonomy-add-row">
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. breaking"
              />
              <Button type="submit" size="sm" disabled={busy || !tagName.trim()}>
                Add
              </Button>
            </div>
          </Field>
        </form>
        {tags.length === 0 ? (
          <p className="text-sm text-faint">No tags yet.</p>
        ) : (
          <ul className="taxonomy-list">
            {tags.map((tag) => (
              <li key={tag.id} className="taxonomy-item">
                <span className="taxonomy-name">{tag.name}</span>
                <span className="taxonomy-meta mono">{tag.slug}</span>
                <button
                  type="button"
                  className="taxonomy-delete"
                  aria-label={`Delete tag ${tag.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete tag "${tag.name}"?`)) {
                      void run("DELETE", { kind: "tag", id: tag.id });
                    }
                  }}
                >
                  <Icon name="logout" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
