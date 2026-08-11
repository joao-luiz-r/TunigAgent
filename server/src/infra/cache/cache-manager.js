export class CacheManager {
  constructor({ sessionCache, factRepository }) {
    this.sessionCache = sessionCache;
    this.factRepository = factRepository;
  }

  async resolveFact(sessionId, toolName, paramsHash) {
    const session = this.sessionCache.get(sessionId);
    if (session && session.facts && session.facts.has(toolName)) {
      const cached = session.facts.get(toolName).get(paramsHash);
      if (cached) return cached;
    }
    const document = await this.factRepository.findByKey(toolName, paramsHash);
    if (!document) return null;
    this.cacheInSession(sessionId, toolName, paramsHash, document.rawData);
    return document.rawData;
  }

  async storeFact(sessionId, toolName, paramsHash, rawData, summary) {
    this.cacheInSession(sessionId, toolName, paramsHash, rawData);
    await this.factRepository.upsert({ toolName, paramsHash, rawData, summary });
  }

  cacheInSession(sessionId, toolName, paramsHash, rawData) {
    const session = this.sessionCache.get(sessionId);
    if (!session) return;
    if (!session.facts) session.facts = new Map();
    if (!session.facts.has(toolName)) session.facts.set(toolName, new Map());
    session.facts.get(toolName).set(paramsHash, rawData);
  }

  async invalidateFacts(sessionId) {
    const session = this.sessionCache.get(sessionId);
    if (session && session.facts) session.facts.clear();
    await this.factRepository.clearAll();
  }
}
