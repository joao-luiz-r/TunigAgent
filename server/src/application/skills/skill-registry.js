export class SkillRegistry {
  constructor() {
    this.items = new Map();
  }

  register(skill) {
    this.items.set(skill.name, skill);
  }

  get(name) {
    return this.items.get(name) || null;
  }

  all() {
    return [...this.items.values()];
  }

  list() {
    return this.all().map((skill) => skill.toMetadata());
  }
}
