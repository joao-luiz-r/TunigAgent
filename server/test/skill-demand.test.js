import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { buildHarnessSystemPrompt } from '../src/application/harness/prompt-builder.js';
import { buildCompactSkillCatalog, buildSkillCatalog } from '../src/application/skills/skill-catalog.js';

function parseToolContent(message) {
  try {
    return JSON.parse(message.content);
  } catch {
    return null;
  }
}

function isSkillDetailsResult(message) {
  const parsed = message.role === 'tool' && parseToolContent(message);
  return Boolean(parsed && Array.isArray(parsed.skills));
}

function hasDataResult(message) {
  const parsed = message.role === 'tool' && parseToolContent(message);
  return Boolean(parsed && (Array.isArray(parsed.columns) || typeof parsed.raw === 'string'));
}

class DemandLlm {
  async createChatCompletion({ messages, tools }) {
    const toolMessages = messages.filter((message) => message.role === 'tool');
    if (!toolMessages.some(isSkillDetailsResult)) {
      return {
        content: null,
        tool_calls: [
          {
            id: 'demand_1',
            type: 'function',
            function: { name: 'get_skill_details', arguments: JSON.stringify({ skills: ['avoid_select_star'] }) },
          },
        ],
      };
    }
    if (!toolMessages.some(hasDataResult)) {
      const first = tools.map((tool) => tool.function).find((fn) => fn.name !== 'get_skill_details');
      return {
        content: null,
        tool_calls: [
          { id: 'demand_2', type: 'function', function: { name: first.name, arguments: JSON.stringify({}) } },
        ],
      };
    }
    return { content: 'Análise final combinada.' };
  }

  async chatJson() {
    return {};
  }
}

test('get_skill_details é resolvida internamente sem pausar para o usuário', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment({ llm: new DemandLlm() });
  const session = sessionManager.create('general_tuning');
  const state = await harness.handleAct(session.sessionId, 'query lenta com SELECT *');

  // A tool interna foi resolvida no histórico...
  const detailsResults = session.history.filter(isSkillDetailsResult);
  assert.ok(detailsResults.length > 0, 'deveria ter resolvido get_skill_details no histórico');
  assert.ok(
    detailsResults.some((message) => parseToolContent(message).skills.some((skill) => skill.name === 'avoid_select_star')),
    'manual da avoid_select_star deveria ter sido carregado',
  );
  assert.ok(session.loadedSkills.includes('avoid_select_star'));

  // ...e a sessão pausou na tool DE DADOS (não na interna).
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(state.pendingTool, 'deveria haver tool de coleta pendente');
  assert.notEqual(state.pendingTool.toolName, 'get_skill_details');
});

test('query com 2 patterns acumula 2 skills e combina na recomendação', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(
    session.sessionId,
    "SELECT * FROM Clientes WHERE Nome LIKE '%joao'",
  );
  assert.ok(session.loadedSkills.includes('avoid_select_star'), 'deveria carregar avoid_select_star');
  assert.ok(session.loadedSkills.includes('avoid_wildcard_prefix'), 'deveria carregar avoid_wildcard_prefix');
  assert.equal(state.state, 'AGUARDANDO_DADO');

  const final = await harness.handleFeedback(
    session.sessionId,
    ['texto_consulta | execucoes', '--------------|----------', "SELECT * FROM Clientes WHERE Nome LIKE '%joao' | 5"].join('\n'),
  );
  assert.equal(final.state, 'CONCLUIDO');
  assert.match(final.finalSuggestion, /SELECT \*/);
  assert.match(final.finalSuggestion, /LIKE/);
});

test('skills desconhecidas em get_skill_details não quebram o loop', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.resolveSkillDetailsCall(session, {
    id: 'unknown_1',
    function: { name: 'get_skill_details', arguments: JSON.stringify({ skills: ['nao_existe'] }) },
  });
  const results = session.history.filter(isSkillDetailsResult);
  assert.equal(results.length, 1);
  assert.deepEqual(parseToolContent(results[0]).unknown, ['nao_existe']);
  assert.ok(!session.loadedSkills.includes('nao_existe'));
});

test('system sob demanda é bem menor que o catálogo completo legado', () => {
  const { skillRegistry } = buildHarnessEnvironment();
  const legacy = buildSkillCatalog(skillRegistry);
  const compact = buildCompactSkillCatalog(skillRegistry);
  assert.doesNotMatch(compact, /```/);
  assert.ok(compact.length < legacy.length / 2, 'compacto deveria custar <50% do legado');

  const prompt = buildHarnessSystemPrompt({
    skill: skillRegistry.get('avoid_select_star'),
    skillRegistry,
  });
  assert.ok(prompt.length < legacy.length, 'system com 1 skill deveria ser menor que o catálogo completo');
});
