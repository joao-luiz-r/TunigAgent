import { loadConfig } from './config/env.js';
import { connectDatabase, closeDatabase } from './infra/mongodb/connection.js';
import { FactRepository } from './infra/repositories/fact-repository.js';
import { SessionRepository } from './infra/repositories/session-repository.js';
import { SkillRepository } from './infra/repositories/skill-repository.js';
import { MigrationRepository } from './infra/repositories/migration-repository.js';
import { SessionCache } from './infra/cache/session-cache.js';
import { CacheManager } from './infra/cache/cache-manager.js';
import { createLlmClient } from './infra/llm/llm-client.js';
import { ContextManager } from './infra/llm/context-manager.js';
import { MigrationService } from './application/migrations/migration-service.js';
import { ToolRegistry } from './application/tools/tool-registry.js';
import { registerAllTools } from './application/tools/register-tools.js';
import { SkillRegistry } from './application/skills/skill-registry.js';
import { SkillLoader } from './application/skills/skill-loader.js';
import { SkillMatcher } from './application/skills/skill-matcher.js';
import { InterviewController } from './application/skill-factory/interview-controller.js';
import { SkillGenerator } from './application/skill-factory/skill-generator.js';
import { SkillFactoryDetector } from './application/skill-factory/skill-factory-detector.js';
import { Harness } from './application/harness/harness.js';
import { SessionManager } from './application/agent/session-manager.js';
import { AgentFacade } from './application/agent/agent-facade.js';
import { createHttpServer } from './interfaces/http/http-server.js';

export async function buildApp() {
  const config = loadConfig();

  const db = await connectDatabase(config.mongodbUri, {
    memoryFallback: config.mongoMemoryFallback,
  });
  const migrationRepository = new MigrationRepository(db);
  const migrationService = new MigrationService({ db, repository: migrationRepository });
  await migrationService.run();

  const factRepository = new FactRepository(db);
  const sessionRepository = new SessionRepository(db);
  const skillRepository = new SkillRepository(db);

  const llm = createLlmClient(config);
  const contextManager = new ContextManager({ maxTokens: config.maxContextTokens });

  const toolRegistry = new ToolRegistry();
  registerAllTools(toolRegistry);

  const skillRegistry = new SkillRegistry();
  const skillLoader = new SkillLoader({ repository: skillRepository, registry: skillRegistry });
  skillLoader.loadFixed();
  await skillLoader.loadDynamic();
  const skillMatcher = new SkillMatcher({ skillRegistry });

  const sessionCache = new SessionCache();
  const cacheManager = new CacheManager({ sessionCache, factRepository });
  const sessionManager = new SessionManager({ sessionCache, repository: sessionRepository });

  const interviewController = new InterviewController({ llm });
  const skillGenerator = new SkillGenerator({ llm, toolRegistry });
  const detector = new SkillFactoryDetector();

  const harness = new Harness({
    sessionManager,
    llm,
    contextManager,
    toolRegistry,
    skillRegistry,
    cacheManager,
    interviewController,
    skillGenerator,
    skillLoader,
    detector,
    skillMatcher,
  });

  const facade = new AgentFacade({ sessionManager, harness, skillRegistry, skillLoader });
  const app = createHttpServer({ facade });

  const close = async () => {
    await closeDatabase();
  };

  return { app, config, close };
}
