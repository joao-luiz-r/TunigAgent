import { BaseRepository } from './base-repository.js';

export class FactRepository extends BaseRepository {
  constructor(db) {
    super(db, 'facts_cache');
  }

  async findByKey(toolName, paramsHash) {
    return this.collection.findOne({ toolName, paramsHash });
  }

  async upsert({ toolName, paramsHash, rawData, summary }) {
    const now = new Date();
    return this.collection.updateOne(
      { toolName, paramsHash },
      {
        $set: { rawData, summary: summary || null, accessedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  async clearAll() {
    return this.collection.deleteMany({});
  }
}
