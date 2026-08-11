export class ToolRegistry {
  constructor() {
    this.items = new Map();
  }

  register(tool) {
    this.items.set(tool.name, tool);
  }

  get(name) {
    return this.items.get(name) || null;
  }

  has(name) {
    return this.items.has(name);
  }

  all() {
    return [...this.items.values()];
  }

  definitions(names) {
    return names
      .map((name) => this.items.get(name))
      .filter(Boolean)
      .map((tool) => tool.getDefinition());
  }
}
