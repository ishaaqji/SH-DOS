import { EventBus } from "./kernel/events";
import { SqliteStore, openDurableDb } from "./kernel/sqlite-store";
import type { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";
import { IdentityService } from "./identity/identity";
import type { User, Workspace } from "./identity/identity";
import { LanguageRegistry } from "./content/language";
import { ContentService } from "./content/service";
import { TranslationService, type TranslateFn } from "./content/translation";
import { SearchIndexService } from "./content/search";
import type { SearchDocRecord } from "./content/search";import { createApiServer } from "./api/server";
import { buildOpenApi } from "./api/openapi";
import { PublishingWorkflow } from "./content/publishing";
import { MediaService } from "./media/service";
import { MemoryStorage, type Storage } from "./media/storage";
import { IndexingHooks } from "./search/hooks";
import { AiGateway } from "./ai/service";
import { AiConfigStore } from "./ai/config";
import { ModelRegistry } from "./ai/registry";
import { UsageMeter } from "./ai/metering";
import { QuotaEnforcer } from "./ai/quota";
import { OpenAIProvider } from "./ai/providers/openai";
import { OllamaProvider } from "./ai/providers/ollama";
import { AiRouter } from "./ai/router/service";
import { ProviderHealthMonitor } from "./ai/router/health";
import { RoutingAuditStore } from "./ai/router/audit";
import { AiGovernance } from "./ai/governance/service";
import { GovernanceConfigStore } from "./ai/governance/config";
import { GovernancePolicyEngine } from "./ai/governance/policy";
import { KeywordModerator } from "./ai/governance/moderation";
import { GovernanceAuditStore } from "./ai/governance/audit";
import { HumanReviewStore } from "./ai/governance/human-review";
import { AiDashboardService } from "./ai/dashboard/service";
import type { UsageRecord, WorkspaceAiConfig } from "./ai/types";
import type { RoutingDecision } from "./ai/router/types";
import type { GovernanceAuditRecord, ReviewRecord, WorkspaceGovernanceConfig } from "./ai/governance/types";
import type {
  Author,
  Category,
  Content,
  ContentVersion,
  Language,
  MediaReference,
  Tag,
  Translation,
} from "./content/types";
import type { WorkflowAudit } from "./content/publishing";

export interface App {
  server: Server;
  bus: EventBus;
  identity: IdentityService;
  content: ContentService;
  registry: LanguageRegistry;
  publishing: PublishingWorkflow;
  media: MediaService;
  ai: AiGateway;
  aiRouter: AiRouter;
  aiGovernance: AiGovernance;
  aiDashboard: AiDashboardService;
  close: () => void;
}

export interface AppOptions {
  seed?: boolean;
  translateText?: TranslateFn;
  storage?: Storage;
  dbPath?: string;
}

export function createApp(options: AppOptions = {}): App {
  const db: DatabaseSync = openDurableDb(options.dbPath ?? ":memory:");
  const bus = new EventBus();
  const identity = new IdentityService(
    new SqliteStore<User>("users", { db }),
    new SqliteStore<Workspace>("workspaces", { db }),
  );

  const stores = {
    contents: new SqliteStore<Content>("contents", { db, workspaceField: "workspaceId" }),
    versions: new SqliteStore<ContentVersion>("versions", { db, workspaceField: "workspaceId" }),
    categories: new SqliteStore<Category>("categories", { db, workspaceField: "workspaceId" }),
    tags: new SqliteStore<Tag>("tags", { db, workspaceField: "workspaceId" }),
    authors: new SqliteStore<Author>("authors", { db, workspaceField: "workspaceId" }),
    media: new SqliteStore<MediaReference>("media", { db, workspaceField: "workspaceId" }),
    translations: new SqliteStore<Translation>("translations", { db, workspaceField: "workspaceId" }),
  };

  const registry = new LanguageRegistry(new SqliteStore<Language>("languages", { db }));
  const searchIndex = new SearchIndexService(
    new SqliteStore<SearchDocRecord>("search_docs", { db, workspaceField: "workspaceId" }),
  );
  const indexingHooks = new IndexingHooks(searchIndex);
  indexingHooks.attach(bus);
  const translationsService = new TranslationService({
    bus,
    contents: stores.contents,
    versions: stores.versions,
    translations: stores.translations,
    registry,
    translateText: options.translateText,
  });

  const content = new ContentService({
    identity,
    registry,
    bus,
    ...stores,
    translationsService,
    searchIndex,
  });

  const publishing = new PublishingWorkflow({
    bus,
    audits: new SqliteStore<WorkflowAudit>("workflow_audits", { db, workspaceField: "workspaceId" }),
    content,
  });

  const media = new MediaService({
    storage: options.storage ?? new MemoryStorage(),
    media: stores.media,
    identity,
  });

  const aiConfig = new AiConfigStore(
    new SqliteStore<WorkspaceAiConfig>("ai_config", { db, workspaceField: "workspaceId" }),
  );
  const aiMeter = new UsageMeter(
    new SqliteStore<UsageRecord>("ai_usage", { db, workspaceField: "workspaceId" }),
  );
  const aiRegistry = new ModelRegistry();
  const aiGateway = new AiGateway({
    identity,
    bus,
    config: aiConfig,
    registry: aiRegistry,
    meter: aiMeter,
    quota: new QuotaEnforcer(aiConfig, aiMeter),
    providers: {
      openai: new OpenAIProvider(),
      ollama: new OllamaProvider(),
    },
  });

  const aiGovernanceConfig = new GovernanceConfigStore(
    new SqliteStore<WorkspaceGovernanceConfig>("governance_config", {
      db,
      workspaceField: "workspaceId",
    }),
  );
  const aiGovernanceAudit = new GovernanceAuditStore(
    new SqliteStore<GovernanceAuditRecord>("governance_audit", { db, workspaceField: "workspaceId" }),
  );
  const aiReviews = new HumanReviewStore(
    new SqliteStore<ReviewRecord>("human_reviews", { db, workspaceField: "workspaceId" }),
  );
  const aiRouter = new AiRouter({
    identity,
    bus,
    gateway: aiGateway,
    config: aiConfig,
    registry: aiRegistry,
    providers: {
      openai: new OpenAIProvider(),
      ollama: new OllamaProvider(),
    },
    health: new ProviderHealthMonitor(),
    audit: new RoutingAuditStore(
      new SqliteStore<RoutingDecision>("routing_audit", { db, workspaceField: "workspaceId" }),
    ),
    allowlist: (workspaceId) => aiGovernanceConfig.policy(workspaceId).modelAllowlist,
  });

  const aiGovernance = new AiGovernance({
    identity,
    bus,
    router: aiRouter,
    config: aiGovernanceConfig,
    engine: new GovernancePolicyEngine(new KeywordModerator()),
    reviews: aiReviews,
    audit: aiGovernanceAudit,
  });

  const aiDashboard = new AiDashboardService({
    identity,
    config: aiConfig,
    meter: aiMeter,
    governanceAudit: aiGovernanceAudit,
    reviews: aiReviews,
  });

  if (options.seed !== false) {
    const getUser = (id: string): User | undefined => {
      try {
        return identity.getUser(id);
      } catch {
        return undefined;
      }
    };
    const owner = getUser("u_owner") ?? identity.createUser({
      id: "u_owner",
      email: "owner@shdos.test",
      name: "Platform Owner",
      password: "password",
      memberships: [{ workspaceId: "*", roles: ["owner"] }],
    });
    if (identity.listWorkspaces().length === 0) {
      identity.createWorkspace({
        name: "Star Hindis",
        slug: "star-hindis",
        baseUrl: "https://starbharat.example",
        defaultLocale: "en",
        ownerId: owner.id,
      });
    }
    if (!getUser("u_editor")) {
      identity.createUser({
        id: "u_editor",
        email: "editor@shdos.test",
        name: "Rohan Editor",
        password: "password",
        memberships: [{ workspaceId: "*", roles: ["editor"] }],
      });
    }
    if (!getUser("u_author")) {
      identity.createUser({
        id: "u_author",
        email: "author@shdos.test",
        name: "Meera Author",
        password: "password",
        memberships: [{ workspaceId: "*", roles: ["author"] }],
      });
    }
  }

  const server = createApiServer({
    identity,
    content,
    publishing,
    media,
    ai: aiGateway,
    aiRouter,
    aiGovernance,
    aiDashboard,
    openapi: buildOpenApi(),
  });

  return {
    server,
    bus,
    identity,
    content,
    registry,
    publishing,
    media,
    ai: aiGateway,
    aiRouter,
    aiGovernance,
    aiDashboard,
    close: () => {
      try {
        db.close();
      } catch {
        // closing an already-closed database is a no-op
      }
    },
  };
}
