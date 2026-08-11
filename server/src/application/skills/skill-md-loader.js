import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Skill } from '../../domain/entities/skill.js';
import { splitFrontmatter } from './frontmatter.js';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const FIXED_SKILLS_DIR = path.join(thisDir, 'fixed');

export function loadFixedSkillsFromMarkdown(dir = FIXED_SKILLS_DIR) {
  const files = readdirSync(dir).filter((file) => file.endsWith('.skill.md')).sort();
  const skills = [];
  for (const file of files) {
    const source = readFileSync(path.join(dir, file), 'utf-8');
    skills.push(skillFromMarkdown(source, { sourceName: file }));
  }
  return skills;
}

export function skillFromMarkdown(source, { sourceName = 'skill.md' } = {}) {
  const { attributes, body } = splitFrontmatter(source);
  const name = attributes.name;
  if (!name) {
    throw new Error(`Skill em markdown inválida (${sourceName}): campo obrigatório "name" ausente.`);
  }

  const sections = parseBodySections(body);
  const pattern = parsePattern(sections.pattern || '');
  const instructions = (sections.instrucoes || body || '').trim();

  return new Skill({
    name,
    description: attributes.description || sections.quando_usar || '',
    systemPrompt: instructions,
    toolsRequired: attributes.tools || [],
    detectionRules: buildDetectionRules(name, attributes, sections),
    recommendationTemplate: sections.recomendacao || attributes.recommendationTemplate || null,
    pattern,
    source: attributes.source || 'fixed',
    version: attributes.version || 1,
    enabled: attributes.enabled !== false,
    isFactory: attributes.isFactory === true,
  });
}

function buildDetectionRules(name, attributes, sections) {
  const description = sections.quando_usar || attributes.description || '';
  if (attributes.detectionRules) return attributes.detectionRules;
  if (!description) return null;
  return {
    type: name,
    description,
    indicators: [],
  };
}

function parseBodySections(body) {
  const sections = {};
  const lines = body.split(/\r?\n/);
  let current = null;
  const raw = {};
  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line.trim());
    if (match) {
      current = match[1].trim();
      raw[current] = [];
    } else if (current) {
      raw[current].push(line);
    }
  }

  const keyMap = {
    'Quando usar': 'quando_usar',
    'Instruções': 'instrucoes',
    'Instrucoes': 'instrucoes',
    'Padrão ANTES/DEPOIS': 'pattern',
    'Padrao ANTES/DEPOIS': 'pattern',
    'ANTES/DEPOIS': 'pattern',
    'Recomendação': 'recomendacao',
    'Recomendacao': 'recomendacao',
  };

  for (const [heading, lines] of Object.entries(raw)) {
    const key = keyMap[heading] || 'outros';
    sections[key] = lines.join('\n').trim();
  }
  return sections;
}

function parsePattern(section) {
  if (!section) return null;
  const text = section;

  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const grab = (label) => {
    const match = text.match(new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*(.+?)(?:\\n\\n|$)`));
    return match ? match[1].trim() : undefined;
  };

  const grabScript = (label) => {
    const fence = String.fromCharCode(96).repeat(3);
    const match = text.match(
      new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*\\n+${fence}(?:sql)?\\s*\\n([\\s\\S]*?)${fence}`),
    );
    return match ? match[1].trim() : undefined;
  };

  const problem = grab('Problema (ANTES)');
  const solution = grab('Solução (DEPOIS)');
  const reason = grab('Motivo');
  const beforeScript = grabScript('Script ANTES');
  const afterScript = grabScript('Script DEPOIS');

  if (!problem && !solution && !beforeScript && !afterScript && !reason) return null;
  return { problem, solution, beforeScript, afterScript, reason };
}
