import { BaseRepository } from './base-repository.js';

export class MigrationRepository extends BaseRepository {
  constructor(db) {
    super(db, 'migrations_control');
  }

  async ensureIndexes() {
    return this.collection.createIndex({ version: 1 }, { unique: true });
  }

  async getAppliedVersions() {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => doc.version);
  }

  async record({ version, description }) {
    return this.collection.insertOne({ version, description, appliedAt: new Date() });
  }
}
