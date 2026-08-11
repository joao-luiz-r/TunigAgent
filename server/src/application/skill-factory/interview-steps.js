import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../skills/frontmatter.js';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const FACTORY_SKILL_NAME = 'skill_factory';

export function loadInterviewSteps(source = readFileSync(path.join(thisDir, 'interview-steps.md'), 'utf-8')) {
  const { body } = splitFrontmatter(source);
  const lines = body.split(/\r?\n/);
  const raw = {};
  let current = null;
  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line.trim());
    if (match) {
      current = match[1].trim();
      raw[current] = [];
    } else if (current) {
      raw[current].push(line);
    }
  }

  const grab = (linesArr, label) => {
    for (const line of linesArr) {
      const match = line.trim().match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`));
      if (match) return match[1].trim();
    }
    return undefined;
  };

  return Object.entries(raw).map(([key, linesArr]) => {
    const topic = grab(linesArr, 'Pergunta');
    const optionalRaw = grab(linesArr, 'Obrigatória') || 'sim';
    return {
      key,
      topic: topic || '',
      optional: optionalRaw.trim().toLowerCase() !== 'sim',
    };
  });
}

export const INTERVIEW_STEPS = loadInterviewSteps();
