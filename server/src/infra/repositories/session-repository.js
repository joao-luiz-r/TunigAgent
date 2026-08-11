import { BaseRepository } from './base-repository.js';

export class SessionRepository extends BaseRepository {
  constructor(db) {
    super(db, 'sessions');
  }

  async findBySessionId(sessionId) {
    return this.collection.findOne({ sessionId });
  }

  async upsertMetadata(session) {
    const now = new Date();
    return this.collection.updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          skillName: session.skillName,
          status: session.status,
          state: session.state,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async markCompleted(sessionId) {
    return this.collection.updateOne({ sessionId }, { $set: { status: 'COMPLETED', updatedAt: new Date() } });
  }
}
