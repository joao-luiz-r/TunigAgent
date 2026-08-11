import { randomUUID } from 'node:crypto';
import { Session } from '../../domain/entities/session.js';
import { SessionStatus } from '../../domain/enums/harness-state.js';

export class SessionManager {
  constructor({ sessionCache, repository }) {
    this.sessionCache = sessionCache;
    this.repository = repository;
  }

  create(skillName) {
    const session = new Session({ sessionId: randomUUID(), skillName });
    this.save(session);
    return session;
  }

  get(sessionId) {
    return this.sessionCache.get(sessionId);
  }

  save(session) {
    session.touch();
    this.sessionCache.save(session);
    this.persistMetadata(session);
    return session;
  }

  complete(session) {
    session.status = SessionStatus.COMPLETED;
    this.save(session);
    return session;
  }

  remove(sessionId) {
    this.sessionCache.remove(sessionId);
  }

  persistMetadata(session) {
    this.repository
      .upsertMetadata(session)
      .catch((error) => console.warn(`[tuning-agent] Falha ao persistir metadados da sessão: ${error.message}`));
  }
}
