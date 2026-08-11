import { MockLlm } from '../src/infra/llm/mock-llm.js';
import { SessionCache } from '../src/infra/cache/session-cache.js';
import { CacheManager } from '../src/infra/cache/cache-manager.js';
import { SessionManager } from '../src/application/agent/session-manager.js';
import { ToolRegistry } from '../src/application/tools/tool-registry.js';
import { registerAllTools } from '../src/application/tools/register-tools.js';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { SkillLoader } from '../src/application/skills/skill-loader.js';
import { SkillMatcher } from '../src/application/skills/skill-matcher.js';
import { InterviewController } from '../src/application/skill-factory/interview-controller.js';
import { SkillGenerator } from '../src/application/skill-factory/skill-generator.js';
import { SkillFactoryDetector } from '../src/application/skill-factory/skill-factory-detector.js';
import { ContextManager } from '../src/infra/llm/context-manager.js';
import { Harness } from '../src/application/harness/harness.js';

export class InMemoryRepository {
  constructor() {
    this.documents = [];
  }

  async findAll() {
    return [...this.documents];
  }

  async save(document) {
    this.documents.push(document);
    return document;
  }

  async findByKey(toolName, paramsHash) {
    return this.documents.find((doc) => doc.toolName === toolName && doc.paramsHash === paramsHash) || null;
  }

  async upsert({ toolName, paramsHash, rawData, summary }) {
    const existing = this.documents.find(
      (doc) => doc.toolName === toolName && doc.paramsHash === paramsHash,
    );
    if (existing) {
      existing.rawData = rawData;
      existing.summary = summary || null;
      existing.accessedAt = new Date();
      return;
    }
    this.documents.push({ toolName, paramsHash, rawData, summary, createdAt: new Date(), accessedAt: new Date() });
  }

  async clearAll() {
    this.documents = [];
    return null;
  }

  async upsertMetadata() {
    return null;
  }
}

export class NoopMigrationRepository {
  async ensureIndexes() {
    return null;
  }

  async getAppliedVersions() {
    return [];
  }

  async record() {
    return null;
  }
}

export function buildHarnessEnvironment({ llm } = {}) {
  const memoryLlm = llm || new MockLlm();
  const sessionCache = new SessionCache();
  const factRepository = new InMemoryRepository();
  const cacheManager = new CacheManager({ sessionCache, factRepository });

  const repository = new InMemoryRepository();
  const sessionManager = new SessionManager({ sessionCache, repository });

  const toolRegistry = new ToolRegistry();
  registerAllTools(toolRegistry);

  const skillRegistry = new SkillRegistry();
  const skillRepository = new InMemoryRepository();
  const skillLoader = new SkillLoader({ repository: skillRepository, registry: skillRegistry });
  skillLoader.loadFixed();

  const contextManager = new ContextManager({ maxTokens: 12000 });
  const interviewController = new InterviewController({ llm: memoryLlm });
  const skillGenerator = new SkillGenerator({ llm: memoryLlm, toolRegistry });
  const detector = new SkillFactoryDetector();
  const skillMatcher = new SkillMatcher({ skillRegistry });

  const harness = new Harness({
    sessionManager,
    llm: memoryLlm,
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

  return {
    harness,
    sessionManager,
    cacheManager,
    toolRegistry,
    skillRegistry,
    skillLoader,
    factRepository,
    skillRepository,
  };
}
