import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const HARNESS_DEFINITION = readFileSync(path.join(thisDir, 'harness.md'), 'utf-8');
