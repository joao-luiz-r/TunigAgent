export class Skill {
  constructor({
    name,
    description,
    systemPrompt,
    toolsRequired = [],
    detectionRules = null,
    recommendationTemplate = null,
    pattern = null,
    source = 'fixed',
    version = 1,
    enabled = true,
    isFactory = false,
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    this.name = name;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.toolsRequired = toolsRequired;
    this.detectionRules = detectionRules;
    this.recommendationTemplate = recommendationTemplate;
    this.pattern = pattern;
    this.source = source;
    this.version = version;
    this.enabled = enabled;
    this.isFactory = isFactory;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  toMetadata() {
    return {
      name: this.name,
      description: this.description,
      source: this.source,
      isFactory: this.isFactory,
      enabled: this.enabled,
    };
  }
}

export function toDocument(skill) {
  return {
    name: skill.name,
    description: skill.description,
    systemPrompt: skill.systemPrompt,
    toolsRequired: skill.toolsRequired,
    detectionRules: skill.detectionRules,
    recommendationTemplate: skill.recommendationTemplate,
    pattern: skill.pattern,
    source: 'factory',
    version: skill.version,
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}

export function fromDocument(document) {
  return new Skill({
    name: document.name,
    description: document.description,
    systemPrompt: document.systemPrompt,
    toolsRequired: document.toolsRequired || [],
    detectionRules: document.detectionRules || null,
    recommendationTemplate: document.recommendationTemplate || null,
    pattern: document.pattern || null,
    source: 'factory',
    version: document.version || 1,
    enabled: document.enabled !== false,
    createdAt: document.createdAt || new Date(),
    updatedAt: document.updatedAt || new Date(),
  });
}
