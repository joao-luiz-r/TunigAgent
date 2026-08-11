export const addTagsAndExamplesMigration = {
  version: 2,
  description: 'Adiciona campos version, tags e examples aos documentos de skills existentes',
  async up(db) {
    await db.collection('skills_library').updateMany({}, { $set: { version: 2, tags: [] } });
    await db
      .collection('skills_library')
      .updateMany({ examples: { $exists: false } }, { $set: { examples: [] } });
  },
};
