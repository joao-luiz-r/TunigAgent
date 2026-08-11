import { getPendingMigrations } from './migration-registry.js';

export class MigrationService {
  constructor({ db, repository }) {
    this.db = db;
    this.repository = repository;
  }

  async run() {
    await this.repository.ensureIndexes();
    const appliedVersions = await this.repository.getAppliedVersions();
    const pending = getPendingMigrations(appliedVersions);
    for (const migration of pending) {
      await migration.up(this.db);
      await this.repository.record({ version: migration.version, description: migration.description });
      console.log(`[tuning-agent] Migração v${migration.version} aplicada: ${migration.description}`);
    }
    if (pending.length === 0) {
      console.log('[tuning-agent] Nenhuma migração pendente.');
    }
    return pending.length;
  }
}
