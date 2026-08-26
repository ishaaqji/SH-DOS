# Release Notes

## v0.4.1 — Publishing, Media, Search & Control Center (2026-08-05)

### Highlights

v0.4.1 adds the publishing workflow audit trail, the media platform, the search
foundation and the SH-DOS Control Center frontend on top of the M3.1 content platform.

### What's included

- **Publishing workflow (M3.2)**: an audit log records every workflow transition,
  scheduling action and scheduled auto-publish with source status, target status,
  actor and time; new audit and allowed-transitions endpoints.
- **Media platform (M3.3)**: raw-bytes upload with magic-byte file detection and
  validation, workspace-scoped media library CRUD, image metadata extraction
  (PNG/JPEG/GIF/BMP/WebP) and an in-memory/disk storage abstraction.
- **Search foundation (M3.4)**: search provider interface, query model and parser
  with pagination and typed filters, a reusable filter builder, and indexing
  hooks that keep the index in sync with content events.
- **SH-DOS Control Center (M4.1)**: Next.js App Router application in `web/` with a
  login page, password-seeded demo users, session cookies, middleware-protected
  dashboard routes, `/api/auth/*` route handlers, a dashboard shell (sidebar
  navigation, tenant switcher, theme toggle, user summary) and a typed API client
  with Next rewrites proxying `/api/v1/*` to the backend. Backend auth API adds
  `POST /api/v1/auth/login` and `GET /api/v1/auth/me`.

### Running

```bash
npm run build     # compile TypeScript backend
npm test          # run the backend test suite
npm start         # start the API on PORT (default 3000)
npm run web:dev   # start the control center (Next.js) in web/
npm run web:test  # run the frontend test suite
```

### Getting started

Seeded identities (use the id as the bearer token, or email + password `password`
via the login API): `u_owner`, `u_editor`, `u_author`. A default workspace
(`star-hindis`) is created on boot.

### Notes

- Storage is in-memory and resets on restart; persistence is planned for a later
  milestone.
- Automatic translations use a pluggable hook; the default implementation is a
  placeholder suitable for wiring a real translation provider.

## v0.4.0-m3.1 — Multilingual Content Platform (2026-08-04)

### Highlights

M3.1 delivers the core Multilingual Content Platform on top of the Kernel and Identity
Platform. It provides a complete content lifecycle with full workflow control, revision
history, scheduling and native multilingual support.

### What's included

- **Content management**: create, edit, publish, archive and soft-delete content across
  nine content types (article, news, video, page, business listing, knowledge base,
  temple, course, event).
- **Publishing workflow**: draft, review, approval, publish, schedule and archive with
  transition-level permission checks.
- **Version history**: automatic revision snapshots with per-version retrieval.
- **Multilingual**: translation relationships between locales, locale fallback chains,
  a seeded language registry, automatic translation hooks and a human review status
  (`auto -> needs_review -> in_review -> approved`).
- **Metadata**: slugs, SEO metadata, canonical URLs, categories, tags, featured images
  and attachments.
- **API**: REST endpoints under `/api/v1` with an OpenAPI 3.0.3 spec, pagination,
  filtering and search. Bearer-token authentication uses the Identity Platform.
- **Permissions**: role-based access control (owner, admin, editor, reviewer, author,
  viewer).

### Running

```bash
npm run build   # compile TypeScript
npm test        # run the test suite
npm start       # start the API on PORT (default 3000)
```

### Getting started

Seeded identities (use the id as the bearer token): `u_owner`, `u_editor`, `u_author`.
A default workspace (`star-hindis`) is created on boot.

### Notes

- Storage is in-memory and resets on restart; persistence is planned for a later
  milestone.
- Automatic translations use a pluggable hook; the default implementation is a
  placeholder suitable for wiring a real translation provider.
