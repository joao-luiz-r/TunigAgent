import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

const raw = readFileSync(path.join(thisDir, 'persona.md'), 'utf-8');

export const AGENT_PERSONA = raw
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
