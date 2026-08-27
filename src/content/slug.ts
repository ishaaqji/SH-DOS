export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "untitled";
}

export function ensureUniqueSlug(base: string, isTaken: (slug: string) => boolean): string {
  if (!isTaken(base)) return base;
  let n = 2;
  while (isTaken(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
