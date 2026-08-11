export const initialSchemaMigration = {
  version: 1,
  description: 'Baseline: campos padrão e índice único de nome em skills_library',
  async up(db) {
    await db.collection('skills_library').createIndex({ name: 1 }, { unique: true });
    await db.collection('skills_library').updateMany(
      {},
      {
        $set: { source: 'factory', enabled: true, version: 1, tags: [] },
        $setOnInsert: { createdAt: new Date(), updatedAt: new Date() },
      },
    );
  },
};
