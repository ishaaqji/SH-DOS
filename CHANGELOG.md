# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project
does not yet follow Semantic Versioning strictly; milestone tags carry the milestone name.

## [Unreleased]

### Added

- **M5.6: SH-DOS AI Content Assistant / Playground**
  - End-user AI assistant at `/dashboard/ai/assistant` reusing the existing
    AI stack end to end — the M5.1 gateway, M5.2 router, M5.3 governance
    layer, quota enforcement and `ai:use` RBAC — via the existing governed
    execute endpoint (`POST .../ai/governance/execute`). No new backend
    routes, services or provider integrations were added; the frontend never
    calls a provider directly.
  - Prompt editor with task templates (chat, summarize, translate, extract,
    code), submit/cancel (AbortController) and loading / empty / success /
    error states.
  - Governed execution: requests are routed through the workspace governance
    policy, quota and model routing exactly like the existing API surface,
    so moderation, PII redaction and the human-review gate all apply.
  - Governance result UI: blocked (`AI_BLOCKED`) and review-required
    (`AI_REVIEW_REQUIRED`) outcomes render safe, user-facing explanations
    (no internal policy findings exposed); quota-not-configured states are
    mapped as well. Successful responses show the model, provider, timestamp,
    token usage and cost from the returned `AiChatResponse`.
  - RBAC + tenant isolation: `canUseAi` (owner/admin/editor/author) gates the
    panel with a denial state for viewers; workspace scoping preserved via
    the `workspaceId` param; backend `identity.authorize("ai", "use")` stays
    the enforcement backstop.
  - Web: `governedAiExecute` client method, `POST /api/ai/assistant` route
    handler, new Assistant sub-nav tab, and mocked-backend tests covering
    client round-trip, governed execution, blocked / review-required flows,
    RBAC denial, tenant isolation and the template/error-state helpers.

- **M5.5: SH-DOS AI Management & Human Review UI**
  - Web management UI reusing the existing AI config, governance and review
    APIs; no new backend routes or services added.
  - `/dashboard/ai/settings`: edit the per-workspace AI configuration
    (`GET/PUT .../ai/config`) — default provider, default model, per-task
    model overrides (`chat`, `summarize`, `classify`, `extract`, `translate`,
    `code`), daily quota (`requestsPerDay`/`tokensPerDay`/`costPerDay`, blank
    keeps the current limit) and per-provider settings (enabled, base URL,
    default model). API keys are stored server-side and never rendered or
    submitted.
  - `/dashboard/ai/governance`: edit the governance policy
    (`GET/PUT .../ai/governance`) — policy toggle, model allowlist (empty
    clears via `null`), PII protection (fields, redact/block), moderation
    (block vs flag categories), input/output safety (blocked terms, length
    limits, prompt-injection detection) and the human-review gate.
  - `/dashboard/ai/review`: pending human-review queue
    (`GET .../ai/governance/reviews/pending` + `POST .../reviews/:reviewId`)
    listing findings and request summaries with approve (optional note) /
    reject (note required) actions that remove the item from the queue on
    success.
  - Shared sub-navigation (Overview / Settings / Governance / Review) on all
    AI dashboard pages reusing the existing publishing-tabs styling.
  - RBAC: manage actions (`ai:manage`, owner/admin/editor only) gate the UI
    via `canManageAi`; viewer/author see read-only forms or the deny state,
    and the backend `identity.authorize` stays the enforcement backstop.
    Every read/write is scoped to the current `workspaceId`.
  - Web client methods (`getAiConfig`, `updateAiConfig`,
    `getGovernancePolicy`, `updateGovernancePolicy`, `listPendingAiReviews`,
    `reviewAiReview`), route handlers (`PUT /api/ai/config`,
    `PUT /api/ai/governance`, `POST /api/ai/reviews/:reviewId`) and mocked
    backend tests covering client round-trips, RBAC/tenant denial and the
    approve/reject flow.

- **M5.4: SH-DOS AI Usage & Governance Dashboard**
  - Dashboard layer (`src/ai/dashboard/`) exposing a per-workspace AI usage
    and governance overview at `/dashboard/ai`, built by aggregating the
    existing `UsageMeter`, `AiConfigStore`, `GovernanceAuditStore` and
    `HumanReviewStore` (no duplicate metering or governance logic).
  - Usage overview filtered by ISO `from`/`to` date range: request/token/
    cost/latency summary, per-day breakdown, per-model and per-provider
    tables (requests, tokens, cost, average latency) derived from metered
    records, reusing `UsageMeter.summary` and the `latencyMs` captured by
    `AiGateway.chat`.
  - Quota consumption card: today's used vs. configured `requestsPerDay`,
    `tokensPerDay` and `costPerDay` limits with remaining headroom.
  - Governance summary: blocked/flagged/redacted/review-required/
    approved/rejected/allowed event counts, PII redaction tally and
    moderation category distribution derived from the governance audit log.
  - Human-review queue summary: pending/approved/rejected review counts from
    `HumanReviewStore`.
  - AI audit trail endpoint (`GET .../ai/dashboard/audit`) merging governance
    audit events and usage request events into one paginated, filterable feed
    (event type, model, provider, date range) using the kernel pagination
    helpers.
  - API routes `GET .../ai/dashboard` and `GET .../ai/dashboard/audit`, both
    gated on `identity.authorize(user, workspaceId, "ai", "read")` so data
    stays tenant-isolated and RBAC-protected.
  - Web: new `AI` navigation entry (`/dashboard/ai`, `ai` icon), server page
    with KPI cards, quota bars, governance/review cards and an interactive
    audit table with event + date filters and pagination; `aiDashboard` and
    `aiAudit` client methods; mocked-backend tests (`web/test/ai.test.ts`).
  - Tests (`test/ai-dashboard.test.ts`): overview aggregation, date-range
    filtering, audit filters + pagination, RBAC (`ai:read`, non-members
    forbidden), tenant isolation and HTTP API coverage.

- **M5.3: SH-DOS AI Governance & Safety**
  - Governance layer (`src/ai/governance/`) enforcing per-workspace AI safety
    policy on top of the M5.2 router: input/output inspection runs before and
    after `AiRouter.complete`, so provider adapters, quota enforcement and
    usage metering remain in the gateway.
  - Governance config store (`GovernanceConfigStore`, independent of the
    existing `AiConfigStore`) holding a per-workspace `GovernancePolicy`
    with model allowlist, PII, moderation, input safety, output safety and
    human-review sections; updated via the `ai:manage`-gated policy API.
  - Model allowlist enforcement wired into the router policy so both
    `aiRouter.plan/complete` and `aiGovernance.execute` reject models outside
    the allowlist with `AI_MODEL_BLOCKED` (403).
  - PII detection and redaction (`pii.ts`) for email, phone, SSN, credit
    card, IP address and address fields: `mode: "redact"` replaces matches
    with `[field]` placeholders before the provider call, `mode: "block"`
    rejects the request.
  - Content moderation hooks (`ContentModerator` / `KeywordModerator`) with
    category keyword sets for hate, harassment, violence, sexual,
    self-harm, spam and harmful content, mapped to block or flag severities.
  - Input safety policy: blocked terms, max prompt length and prompt-injection
    detection; output safety policy: blocked terms and max output length.
  - Human-review gate: flagged requests/outputs with no block verdict create a
    pending `ReviewRecord` and throw `AI_REVIEW_REQUIRED` (403) instead of
    reaching the provider; approve/reject decisions require `ai:manage`.
  - Governance audit log (`GovernanceAuditStore`) recording blocked, flagged,
    redacted, review-required and review-approved/rejected events, plus
    `ai.governance.*` events on the existing `EventBus`.
  - API routes: `GET|PUT .../ai/governance` (policy), `POST .../ai/governance/inspect`
    (dry-run decision, `ai:read`), `POST .../ai/governance/execute` (`ai:use`),
    `GET .../ai/governance/reviews` and `GET .../ai/governance/reviews/pending`,
    `POST .../ai/governance/reviews/:id` (approve/reject), `GET .../ai/governance/audit`.
  - Tests (`test/ai-governance.test.ts`): policy defaults/updates, model
    allowlist via router and governance execute, quota enforcement through
    the gateway, PII redaction and block modes, moderation block on input and
    output, prompt-injection/blocked-term input safety, human-review
    approve/reject gates, tenant isolation of policy/reviews/audit, RBAC
    (`ai:read`/`ai:use`/`ai:manage`), safe failure with disabled policy, and
    governance audit events.

- **M5.2: SH-DOS AI Model Router**
  - Routing layer (`src/ai/router/`) on top of the M5.1 gateway that selects
    a provider + model and delegates actual execution to the existing
    `AiGateway.chat`, so provider adapters, quota enforcement and usage
    metering stay in the gateway.
  - Routing policy (`policy.ts`) built from workspace config: provider order
    (preferred provider first, then default provider), task-type model
    overrides (`taskModels`) falling back to the workspace `defaultModel`,
    explicit `preferredModel` hard pin, capability matching against the
    model registry, and cost/latency-aware ranking of alternates.
  - Estimated cost and token accounting per candidate using the same
    per-1M-token pricing as the gateway, so `maxCost` filters candidates
    before execution and `latencyPreference: "low"` orders by average
    latency.
  - Fallback policies (`never`, `alternate_provider`, `alternate_model`,
    `alternate_any`) driving retries with an alternate provider/model after
    provider-level failures (unavailable, timeout, rate limit, auth,
    provider error).
  - Health-aware provider selection (`ProviderHealthMonitor`) that pings
    providers (cached 10 s per workspace:provider) and deprioritizes
    unhealthy ones during candidate ordering.
  - Routing audit log (`RoutingAuditStore`) recording every decision —
    candidates, attempts, selected route, status and error code — plus
    `ai.routed` / `ai.route_error` events on the existing `EventBus`.
  - Config surface extended with `defaultModel` and `taskModels` managed via
    the existing `ai:manage`-gated config API (`PUT .../ai/config`).
  - API routes: `POST .../ai/route` (execute, `ai:use`), `POST .../ai/route/plan`
    (dry-run candidates, `ai:read`) and `GET .../ai/route/audit` (`ai:read`).
  - Tests (`test/ai-router.test.ts`): default/task-model routing, preferred
    provider/model ordering, fallback across providers/models and the `never`
    policy, capability matching, cost and latency policies, health-aware
    deprioritization, per-workspace audit isolation, RBAC for routing and
    config changes, and input validation.

- **M5.1: AI Gateway Foundation**
  - Provider-agnostic AI gateway module under `src/ai/` with a normalized
    `AiChatRequest`/`AiChatResponse` contract, so business code never depends
    on a specific vendor's request/response shape.
  - Pluggable provider interface (`AiProvider`) with an OpenAI-compatible and
    an Ollama adapter. Both speak a shared JSON transport that applies
    per-provider timeout and retry policy; retries only fire for retryable
    failures (network errors, 408/429/5xx) and skip 4xx client errors.
  - Structured AI error model (`AiError` extending `DomainError`) with typed
    codes for unavailable/timeout/rate-limit/quota/invalid-request/auth and
    model-not-found, carrying provider, model and retryable flags.
  - Model registry with per-provider model metadata (context window, max
    output tokens, per-1M-token pricing) used to compute request cost.
  - Server-side provider/model configuration store keyed by workspace. API
    keys are stored server-side only and never serialized into API responses,
    status payloads or the OpenAPI surface; `PublicAiConfig` strips secrets.
  - Per-tenant quota enforcement (`requestsPerDay`, `tokensPerDay`,
    `costPerDay`) checked before every call, rejecting with
    `AI_QUOTA_EXCEEDED` (429) once limits are reached.
  - Token usage and cost metering per workspace with daily rollups and recent
    call history, plus audit events (`ai.completed` / `ai.error`) emitted on
    the existing `EventBus`.
  - RBAC wiring: new `ai` resource with `read`/`use`/`manage` actions in
    `src/identity/permissions.ts`; owner/admin `*:*`, editor can read/use/
    manage, author and reviewer can read/use, viewer read-only. All gateway
    methods authorize through `identity.authorize`, enforcing tenant
    isolation deterministically.
  - API routes under `/api/v1/workspaces/:workspaceId/ai/...`: `GET status`
    (provider health + models + quota + usage), `GET/PUT config`, `POST chat`
    and `GET usage`.
  - Tests (`test/ai.test.ts`): adapter normalization for both providers,
    retry vs no-retry behaviour, timeout handling, auth/rate-limit mapping,
    quota enforcement (request and token limits), cost metering, per-tenant
    isolation of config and usage, cross-tenant RBAC denial and secret
    redaction in status/config payloads.

- **M4.6: Search UI**
  - Search page at `/dashboard/search` backed by the existing M3.4 search
    foundation and content list API, so results span every locale and workflow
    status in the current workspace.
  - Debounced query input (350 ms) with a clear button and an inline "Searching…"
    indicator while the URL re-renders server results.
  - Filters for content type, status, locale, category and tag plus a clear-all
    action; server-side filtering keeps result sets authoritative.
  - Paginated results (pager and load-more) with server-side pagination.
  - Result cards showing title, type, status badge, locale and excerpt; cards
    open in the existing content manager editor for roles that can manage
    content (`content:update`), gated by the existing RBAC helpers.
  - Empty states for the initial prompt and for no-match queries, plus a
    dedicated loading state during debounced navigation.
  - Search helpers in `lib/search.ts` (active-search detection, result count
    labels) and a Search nav item with the existing search icon.
  - Tests for search helpers, query parsing/pagination and the content search
    API client (term, filters, locale and pagination).

- **M4.5: Publishing Queue**
  - Publishing queue at `/dashboard/publishing` with workflow-stage tabs
    (all/draft/in review/approved/published) backed by the existing filtered and
    paginated content list API.
  - Per-status action buttons gated to the backend permission model: submit for
    review / request changes / unapprove / unpublish / restore require
    `content:update`; approve requires `content:review`; publish and archive
    require `content:publish`; actions a user cannot legally take are hidden.
  - Schedule publishing dialog via `/api/content/[contentId]/schedule` and a
    "Run scheduler" action via `/api/scheduler/run` for publish-capable roles.
  - Revision history modal showing content versions (`/versions`) and workflow
    activity (`/audit`) as dual timelines.
  - Web proxy routes for transition, schedule, versions, audit and the scheduler
    run endpoint; typed client methods (`transitionContent`, `scheduleContent`,
    `contentVersions`, `contentAudit`, `allowedTransitions`, `runScheduler`) and
    `ContentVersion`/`WorkflowAudit`/`TransitionOption` types.
  - Publishing nav item and icon, queue/timeline/dialog styles, and helper
    functions in `lib/publishing.ts`.
  - Tests for publishing helpers (labels, permission gating, queue tabs) and the
    workflow API client (transition/schedule/versions/audit/transitions/scheduler).

- **M4.4: Media Library**
  - Media library at `/dashboard/media` with a responsive card grid showing
    image thumbnails and kind icons for files, audio and video.
  - Upload with a file picker constrained to supported types
    (png/jpg/gif/webp/bmp/pdf/mp3/wav/mp4); the web proxy route
    `/api/media/upload` forwards bytes to the backend upload API.
  - Item preview modal with metadata panel (kind, mime type, size, dimensions,
    usage, uploaded date), editable alt text and usage via `/api/media/[mediaId]`.
  - Replace file action via `/api/media/[mediaId]/replace` keeping the same media
    id and URL while swapping the stored bytes and metadata.
  - Delete per item plus bulk delete via `/api/media/bulk` with multi-select
    checkboxes on each card.
  - Search plus filters by kind and usage, and client-side pagination over the
    full media list.
  - Media kind/file icons and `lib/media.ts` helpers (query parsing, filtering,
    pagination, labels, byte formatting).
  - Backend `MediaService.update` and `MediaService.replace` with
    `PATCH /media/:mediaId` and `POST /media/:mediaId/replace` routes, raw body
    upload limit raised to 20 MB, and media bytes served from `/media/{key}`.
  - Tests for media helpers, the media API client (upload/list/update/replace/
    delete), backend update/replace and byte serving.

- **M4.3: Content Manager**
  - Content list at `/dashboard/content` with server-side pagination, sorting and
    search integration backed by the content list API and search index.
  - Filters by type, status, category, tag and locale with a clear-filters action.
  - Create and edit forms at `/dashboard/content/new` and
    `/dashboard/content/[contentId]/edit` (title, slug, type, excerpt, body,
    author, locale, categories and tags); slug auto-generates from the title.
  - Delete per item plus bulk actions (publish, archive, delete) via
    `/api/content/bulk`; status transitions use the workflow transition API.
  - Categories and tags management panel with inline create/delete.
  - Workflow status badges (draft/review/approved/published/archived), content
    type labels and empty states.
  - Shared status helpers in `lib/status.ts` and permission helpers in
    `lib/permissions.ts` reused by the dashboard activity panel.
  - Typed API client methods for content CRUD, transitions, categories, tags,
    authors and languages.
  - Tests for content query parsing, pagination, status/type helpers, permission
    gating and the content API client.

- **M4.2: Dashboard Landing**
  - Dashboard landing page at `/dashboard` showing role-aware welcome, KPI grid,
    recent activity, quick actions and live system status.
  - Server-side dashboard data aggregation (`fetchDashboardData`) via
    `Promise.allSettled` over backend health, content, media and workspace APIs,
    degrading gracefully to placeholder values when an endpoint is unavailable.
  - KPI cards for Users, Organizations, Content and Media; Users shows a
    "Live data coming soon" placeholder until a backend endpoint exists.
  - Recent activity panel listing latest content updates with workflow status
    badges and an empty state.
  - Quick actions linking to existing module routes (content, media, users,
    analytics).
  - System status panel deriving service health from live probes (Core API,
    Content, Media operational; Search index "not reporting" placeholder).
  - Reusable components: `KpiCard`, `RecentActivity`, `QuickActions`,
    `SystemStatus` and `UserMenu` (profile dropdown with sign-out).
  - `getServerApi` helper for authenticated server-side API access; `roleFor`
    moved to `lib/nav` so client components stay server-import-free.
  - Responsive dashboard grid (desktop/tablet) and tests for dashboard data
    fetching and the API client methods.

- **M4.1: SH-DOS Control Center Foundation**
  - Next.js control center application in `web/` (App Router, server components).
  - Authentication: login page, password-seeded demo users, session cookie,
    middleware-protected dashboard routes and `/api/auth/*` route handlers.
  - Backend auth API: `POST /api/v1/auth/login` and `GET /api/v1/auth/me` with
    per-user workspace filtering via `IdentityService.login` and `workspacesFor`.
  - Dashboard shell: sidebar navigation, tenant switcher, theme toggle, user
    summary and sign-out.
  - Design system: themed CSS variables (light/dark), buttons, inputs, cards,
    badges, avatars, icons and layout primitives.
  - API client: typed `createApiClient` shared by server components and the
    browser, with Next rewrites proxying `/api/v1/*` to the backend.
  - Frontend tests for theme, navigation helpers and the API client.

- **M3.4: Search Foundation**
  - Search abstraction: provider interface, query model and parser with
    pagination and typed filters.
  - Reusable filter builder (`buildFilter`) and field accessor for structured
    search predicates.
  - Indexing hooks keep the search index in sync with content events.
  - Content list search now routes through the query builder and provider.

- **M3.3: Media Platform**
  - Upload API: raw-bytes upload with magic-byte file detection and validation
    (size limits, supported types).
  - Media library: CRUD over media references scoped per workspace.
  - Image metadata: width/height extracted for PNG, JPEG, GIF, BMP and WebP.
  - Storage abstraction: `Storage` interface with in-memory and disk backends.
  - Attachments: uploaded media can be linked as featured images or attachments.

- **M3.2: Publishing Workflow**
  - Workflow audit log: every transition (`draft`, `review`, `approved`, `published`,
    `archived`, `draft`) is recorded with source status, target status, actor and time.
  - Scheduling actions are recorded, including scheduled auto-publishes.
  - `GET /content/{id}/audit` and `GET /content/{id}/transitions` endpoints.
  - Transitions now record the performing user as the audit actor.

## [v0.4.0-m3.1] - 2026-08-04

### Added

- **M3: Multilingual Content Platform**
  - Content lifecycle: create, edit, publish, soft delete and restore.
  - Version history: every mutation produces a numbered, queryable snapshot.
  - Publishing workflow: `draft -> review -> approved -> published -> archived -> draft`.
  - Scheduling: deferred publishing with a scheduler that publishes due content.
  - Slugs (auto-generated and unique), SEO metadata and canonical URLs.
  - Taxonomy: categories and tags; featured images and attachments via media references.
  - Search indexing hooks keeping an index in sync with content events.
  - Multilingual: translation relationships, locale fallback chains, language registry,
    automatic translation hooks and a human review flow for translations.
  - REST API with an OpenAPI 3.0.3 specification (`/openapi.json`), pagination,
    filtering, search and role-based permissions.
- **Kernel**: event bus, in-memory store with soft delete, domain error model, id generation,
  pagination/filtering/search utilities.
- **Identity Platform**: users, workspaces, memberships and role-based access control
  (owner, admin, editor, reviewer, author, viewer).

## [Initial commit]

- Repository skeleton and project readme only.
