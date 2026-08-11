import { fromDocument, toDocument } from '../../domain/entities/skill.js';
import { loadFixedSkillsFromMarkdown } from './skill-md-loader.js';

export class SkillLoader {
  constructor({ repository, registry }) {
    this.repository = repository;
    this.registry = registry;
  }

  loadFixed() {
    loadFixedSkillsFromMarkdown().forEach((skill) => this.registry.register(skill));
  }

  async loadDynamic() {
    const documents = await this.repository.findAll();
    documents.forEach((document) => {
      const skill = fromDocument(document);
      if (skill.enabled) this.registry.register(skill);
    });
  }

  async registerDynamic(skill) {
    await this.repository.save(toDocument(skill));
    this.registry.register(skill);
    return skill;
  }
}
