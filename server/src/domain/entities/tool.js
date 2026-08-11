import { createHash } from 'node:crypto';
import { parseTabularResult } from '../../application/tools/parsers/table-result-parser.js';

export class CollectTool {
  constructor({ name, description, parameters, buildScript }) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.buildScript = buildScript;
  }

  getDefinition() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  computeKey(params) {
    const stable = Object.keys(params || {})
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});
    return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  }

  parseResult(rawText) {
    const parsed = parseTabularResult(rawText);
    if (parsed) return parsed;
    return { raw: String(rawText || '').trim() };
  }
}
