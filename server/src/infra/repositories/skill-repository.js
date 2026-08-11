import { BaseRepository } from './base-repository.js';

export class SkillRepository extends BaseRepository {
  constructor(db) {
    super(db, 'skills_library');
  }

  async findAll() {
    return this.collection.find({}).toArray();
  }

  async findByName(name) {
    return this.collection.findOne({ name });
  }

  async save(document) {
    return this.collection.insertOne(document);
  }

  async updateByName(name, updates) {
    return this.collection.updateOne({ name }, { $set: { ...updates, updatedAt: new Date() } });
  }

  async deleteByName(name) {
    return this.collection.deleteOne({ name });
  }
}
