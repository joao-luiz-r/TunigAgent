import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const INTERVIEW_PROMPT_TEMPLATE = readFileSync(path.join(thisDir, 'interview.md'), 'utf-8');
export const SKILL_GENERATOR_PROMPT = readFileSync(path.join(thisDir, 'skill-generator.md'), 'utf-8');

export function buildInterviewSystemPrompt({ stepNumber, totalSteps, topic, context }) {
  return INTERVIEW_PROMPT_TEMPLATE.replace('{n}', String(stepNumber))
    .replace('{total}', String(totalSteps))
    .replace('{topic}', topic)
    .replace('{context}', JSON.stringify(context));
}
