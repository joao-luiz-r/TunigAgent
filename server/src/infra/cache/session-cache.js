export class SessionCache {
  constructor() {
    this.sessions = new Map();
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  save(session) {
    this.sessions.set(session.sessionId, session);
  }

  remove(sessionId) {
    this.sessions.delete(sessionId);
  }

  clear() {
    this.sessions.clear();
  }
}
