import { initialSchemaMigration } from './migration-v1.js';
import { addTagsAndExamplesMigration } from './migration-v2.js';

export const migrations = [initialSchemaMigration, addTagsAndExamplesMigration];

export function getPendingMigrations(appliedVersions) {
  const applied = new Set(appliedVersions);
  return migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);
}
