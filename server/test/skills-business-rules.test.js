import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixedSkillsFromMarkdown } from '../src/application/skills/skill-md-loader.js';
import { ToolRegistry } from '../src/application/tools/tool-registry.js';
import { registerAllTools } from '../src/application/tools/register-tools.js';

test('regras de negócio: todas as 48 skills fixas possuem diagnóstico ANTES/DEPOIS e recomendação válidos', () => {
  const allSkills = loadFixedSkillsFromMarkdown();
  const domainSkills = allSkills.filter((s) => !s.isFactory && s.name !== 'general_tuning');
  const toolRegistry = new ToolRegistry();
  registerAllTools(toolRegistry);

  assert.equal(domainSkills.length, 48, 'esperado exatamente 48 skills fixas de diagnóstico');

  const namesSet = new Set();
  const sqlKeywordRegex = /\b(SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|DECLARE|WITH)\b/i;

  for (const skill of domainSkills) {
    // 1. Identificador e metadados
    assert.ok(skill.name && skill.name.length > 2, `Skill sem nome válido`);
    assert.ok(!namesSet.has(skill.name), `Nome de skill duplicado: ${skill.name}`);
    namesSet.add(skill.name);
    assert.equal(skill.source, 'fixed', `Skill ${skill.name} deveria ter source 'fixed'`);
    assert.equal(skill.enabled, true, `Skill ${skill.name} deveria estar habilitada`);
    assert.equal(skill.isFactory, false, `Skill ${skill.name} não deve ser factory`);
    assert.ok(skill.description && skill.description.trim().length > 10, `Skill ${skill.name} sem descrição adequada`);
    assert.ok(skill.systemPrompt && skill.systemPrompt.trim().length > 20, `Skill ${skill.name} sem system prompt`);

    // 2. Tools registradas e válidas
    assert.ok(Array.isArray(skill.toolsRequired) && skill.toolsRequired.length > 0, `Skill ${skill.name} sem toolsRequired`);
    for (const toolName of skill.toolsRequired) {
      assert.ok(toolRegistry.get(toolName), `Skill ${skill.name} referencia tool inexistente: "${toolName}"`);
    }

    // 3. Keywords para busca e roteamento
    assert.ok(Array.isArray(skill.keywords) && skill.keywords.length >= 2, `Skill ${skill.name} deve ter pelo menos 2 keywords`);
    for (const kw of skill.keywords) {
      assert.ok(typeof kw === 'string' && kw.trim().length > 1, `Skill ${skill.name} tem keyword inválida: "${kw}"`);
    }

    // 4. Padrão ANTES/DEPOIS completo
    assert.ok(skill.pattern, `Skill ${skill.name} não possui padrão ANTES/DEPOIS`);
    const { problem, solution, reason, beforeScript, afterScript } = skill.pattern;

    assert.ok(typeof problem === 'string' && problem.trim().length > 10, `Skill ${skill.name} sem descrição do problema (ANTES)`);
    assert.ok(typeof solution === 'string' && solution.trim().length > 5, `Skill ${skill.name} sem descrição da solução (DEPOIS)`);
    assert.ok(typeof reason === 'string' && reason.trim().length > 10, `Skill ${skill.name} sem motivo/justificativa`);

    assert.ok(typeof beforeScript === 'string' && beforeScript.trim().length > 5, `Skill ${skill.name} sem Script ANTES`);
    assert.ok(typeof afterScript === 'string' && afterScript.trim().length > 5, `Skill ${skill.name} sem Script DEPOIS`);
    assert.notEqual(beforeScript.trim(), afterScript.trim(), `Skill ${skill.name} tem Script ANTES idêntico ao DEPOIS`);

    assert.ok(sqlKeywordRegex.test(beforeScript), `Skill ${skill.name} tem Script ANTES sem SQL reconhecível`);
    assert.ok(sqlKeywordRegex.test(afterScript), `Skill ${skill.name} tem Script DEPOIS sem SQL reconhecível`);

    // 5. Recomendação acionável
    assert.ok(
      typeof skill.recommendationTemplate === 'string' && skill.recommendationTemplate.trim().length > 15,
      `Skill ${skill.name} sem recomendação acionável`,
    );
  }
});
