import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontmatter } from '../src/application/skills/frontmatter.js';
import { skillFromMarkdown, loadFixedSkillsFromMarkdown } from '../src/application/skills/skill-md-loader.js';
import { buildSkillCatalog } from '../src/application/skills/skill-catalog.js';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';

const SAMPLE_MD = [
  '---',
  'name: avoid_select_star',
  'description: Detecta consultas com SELECT *.',
  'tools:',
  '  - get_query_text',
  '---',
  '# Skill: avoid_select_star',
  '',
  '## Quando usar',
  '',
  'Use quando a consulta contém SELECT *.',
  '',
  '## Instruções',
  '',
  'Sua missão é detectar SELECT *.',
  '',
  '## Padrão ANTES/DEPOIS',
  '',
  '**Problema (ANTES):** Consulta usa SELECT *.',
  '',
  '**Solução (DEPOIS):** Listar colunas explicitamente.',
  '',
  '**Script ANTES:**',
  '',
  '```sql',
  'SELECT * FROM Pedidos;',
  '```',
  '',
  '**Script DEPOIS:**',
  '',
  '```sql',
  'SELECT Id FROM Pedidos;',
  '```',
  '',
  '**Motivo:** Reduz I/O.',
  '',
  '## Recomendação',
  '',
  'Substituir SELECT * por colunas explícitas da tabela {tabela}.',
].join('\n');

test('splitFrontmatter separa frontmatter simples e corpo markdown', () => {
  const { attributes, body } = splitFrontmatter(SAMPLE_MD);
  assert.equal(attributes.name, 'avoid_select_star');
  assert.equal(attributes.description, 'Detecta consultas com SELECT *.');
  assert.deepEqual(attributes.tools, ['get_query_text']);
  assert.match(body, /## Quando usar/);
  assert.match(body, /## Padrão ANTES\/DEPOIS/);
});

test('skillFromMarkdown extrai seções do corpo (instruções, pattern, quando usar, recomendação)', () => {
  const skill = skillFromMarkdown(SAMPLE_MD);
  assert.equal(skill.name, 'avoid_select_star');
  assert.deepEqual(skill.toolsRequired, ['get_query_text']);
  assert.match(skill.systemPrompt, /Sua missão é detectar SELECT \*/);
  assert.match(skill.detectionRules.description, /Use quando a consulta contém SELECT \*/);
  assert.equal(skill.pattern.problem, 'Consulta usa SELECT *.');
  assert.equal(skill.pattern.solution, 'Listar colunas explicitamente.');
  assert.equal(skill.pattern.beforeScript, 'SELECT * FROM Pedidos;');
  assert.equal(skill.pattern.afterScript, 'SELECT Id FROM Pedidos;');
  assert.equal(skill.pattern.reason, 'Reduz I/O.');
  assert.equal(skill.recommendationTemplate, 'Substituir SELECT * por colunas explícitas da tabela {tabela}.');
  assert.equal(skill.source, 'fixed');
});

test('skillFromMarkdown exige campo name', () => {
  assert.throws(() => skillFromMarkdown('---\ndescription: sem nome\n---\ncorpo'), /name/);
});

test('loadFixedSkillsFromMarkdown carrega todos os arquivos .skill.md', () => {
  const skills = loadFixedSkillsFromMarkdown();
  const names = skills.map((skill) => skill.name).sort();
  assert.ok(names.length >= 10, 'deve haver pelo menos 10 skills fixas');
  assert.ok(names.includes('avoid_select_star'));
  assert.ok(names.includes('avoid_non_sargable_predicate'));
  assert.ok(names.includes('skill_factory'));
  assert.ok(skills.every((skill) => skill.systemPrompt.length > 0));
});

test('buildSkillCatalog gera referência com ANTES/DEPOIS e ignora factory', () => {
  const registry = new SkillRegistry();
  registry.register(skillFromMarkdown(SAMPLE_MD));
  registry.register(
    skillFromMarkdown('---\nname: skill_factory\nisFactory: true\n---\n# Skill: skill_factory\n\n## Instruções\n\nConduz a factory.'),
  );

  const catalog = buildSkillCatalog(registry);
  assert.match(catalog, /# 📚 Catálogo de Skills Disponíveis/);
  assert.match(catalog, /avoid_select_star/);
  assert.match(catalog, /\*\*Problema \(ANTES\):\*\*/);
  assert.match(catalog, /SELECT \* FROM Pedidos;/);
  assert.match(catalog, /SELECT Id FROM Pedidos;/);
  assert.doesNotMatch(catalog, /skill_factory/);
});

test('buildSkillCatalog atualiza automaticamente quando nova skill é registrada', () => {
  const registry = new SkillRegistry();
  registry.register(skillFromMarkdown(SAMPLE_MD));
  assert.doesNotMatch(buildSkillCatalog(registry), /nova_skill_teste/);

  registry.register(
    skillFromMarkdown('---\nname: nova_skill_teste\n---\n# Skill: nova_skill_teste\n\n## Instruções\n\nSkill nova.'),
  );
  assert.match(buildSkillCatalog(registry), /nova_skill_teste/);
});
