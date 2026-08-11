import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHarnessEnvironment } from './helpers.js';
import { buildHarnessSystemPrompt, isolateUserData, USER_DATA_OPEN, USER_DATA_CLOSE } from '../src/application/harness/prompt-builder.js';
import { HARNESS_DEFINITION } from '../src/application/harness/harness-definition.js';
import { SkillHandoffDetector } from '../src/application/harness/skill-handoff-detector.js';

class HandoffLlm {
  constructor() {
    this.calls = [];
  }

  async createChatCompletion({ system, messages, tools }) {
    this.calls.push({ system, messages, tools });
    const hasToolResult = messages.some((message) => message.role === 'tool');
    if (!hasToolResult && tools && tools.length > 0) {
      const first = tools[0].function;
      return {
        content: null,
        tool_calls: [
          {
            id: `mock_${Date.now()}`,
            type: 'function',
            function: { name: first.name, arguments: JSON.stringify({}) },
          },
        ],
      };
    }
    return {
      content:
        'A reescrita sargável é necessária. Como não há índice adequado, aciono a skill de criação de índices. [SKILL_HANDOFF:create_assertive_index]',
    };
  }

  async chatJson() {
    return {};
  }
}

test('harness.md proíbe suposições sem dados (anti-suposição)', () => {
  assert.match(HARNESS_DEFINITION, /Proibi[çc][aã]o de Suposi[cç][oõ]es/i);
  assert.match(HARNESS_DEFINITION, /NUNCA afirme fatos estruturais/i);
  assert.match(HARNESS_DEFINITION, /Northwind/);
});

test('harness.md protege contra prompt injection', () => {
  assert.match(HARNESS_DEFINITION, /Prompt Injection/i);
  assert.match(HARNESS_DEFINITION, /dado n[ãa]o confi[iá]vel/i);
  assert.match(HARNESS_DEFINITION, /prevalecem as instru[çc][oõ]es do system prompt/i);
});

test('isolateUserData envolve conteúdo do usuário em marcadores de dados', () => {
  const isolated = isolateUserData([
    { role: 'user', content: 'SELECT * FROM Pedidos;' },
    { role: 'assistant', content: 'ok' },
    { role: 'tool', tool_call_id: 'x', content: '{}' },
  ]);
  assert.equal(isolated[0].content, `${USER_DATA_OPEN}\nSELECT * FROM Pedidos;\n${USER_DATA_CLOSE}`);
  assert.equal(isolated[1].content, 'ok');
  assert.equal(isolated[2].content, '{}');
});

test('buildHarnessSystemPrompt inclui persona, catálogo, harness e skill ativa', () => {
  const { harness, skillRegistry } = buildHarnessEnvironment();
  const skill = skillRegistry.get('avoid_select_star');
  const prompt = buildHarnessSystemPrompt({ skill, skillRegistry });
  assert.match(prompt, /\[skill_name: avoid_select_star\]/);
  assert.match(prompt, /Catálogo de Skills Disponíveis/);
  assert.match(prompt, /Definição do Harness/);
  assert.match(prompt, /Proibi[çc][aã]o de Suposi[cç][oõ]es/i);
});

test('harness.md orienta invalidar dados coletados após mudança', () => {
  assert.match(HARNESS_DEFINITION, /Invalida[cç][aã]o de Dados Coletados/i);
  assert.match(HARNESS_DEFINITION, /solicite os dados\s+atualizados novamente/i);
});

test('harness.md limita respostas ao escopo de tuning de SQL Server', () => {
  assert.match(HARNESS_DEFINITION, /Escopo de Atua[cç][aã]o/i);
  assert.match(HARNESS_DEFINITION, /N[\u00c3]O responda perguntas fora desse escopo/i);
  assert.match(HARNESS_DEFINITION, /Quem descobriu o Brasil/i);
  assert.match(HARNESS_DEFINITION, /Qual \u00e9 o maior planeta/i);
});

test('mensagem de mudança de banco invalida fatos cacheados', async () => {
  const { harness, sessionManager, cacheManager, factRepository } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'query lenta com select *');

  const tabular = ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n');
  await harness.handleFeedback(session.sessionId, tabular);
  assert.ok(factRepository.documents.length > 0, 'fato deveria estar persistido');

  await harness.handleAct(session.sessionId, 'criei um índice e a tabela mudou, reavalia');
  assert.equal(factRepository.documents.length, 0, 'fatos persistidos deveriam ser limpos');
  assert.equal(session.facts.size, 0, 'fatos da sessão deveriam ser limpos');
});

test('act com skill fixa: PENSANDO -> AGUARDANDO_DADO quando pede tool', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  const state = await harness.handleAct(session.sessionId, 'Minha query usa SELECT * e está lenta');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(state.pendingTool, 'deveria haver uma tool pendente');
  assert.ok(state.pendingTool.script.length > 0);
  assert.equal(session.state, 'AGUARDANDO_DADO');
});

test('feedback com resultado válido: VALIDANDO -> CONCLUIDO e salva fato', async () => {
  const { harness, sessionManager, factRepository } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'query lenta com select *');

  const tabular = ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n');
  const state = await harness.handleFeedback(session.sessionId, tabular);
  assert.equal(state.state, 'CONCLUIDO');
  assert.equal(state.status, 'COMPLETED');
  assert.ok(state.finalSuggestion && state.finalSuggestion.length > 0);
  assert.ok(factRepository.documents.length > 0, 'fato deveria estar persistido no repositório');
});

test('feedback com conteúdo não-tabular (ex: XML de plano) é aceito como raw', async () => {
  const { harness, sessionManager, factRepository } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'query lenta');

  const state = await harness.handleFeedback(session.sessionId, '%%% isso não é tabela %%%');
  assert.equal(state.state, 'CONCLUIDO');
  assert.equal(state.status, 'COMPLETED');
  assert.equal(factRepository.documents[0].rawData.raw, '%%% isso não é tabela %%%');
});

test('resultados de tool são cacheados (não refaz solicitação)', async () => {
  const { harness, sessionManager, cacheManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'consulta com select *');
  const pending = session.pendingTool;
  const cached = await cacheManager.resolveFact(session.sessionId, pending.toolName, pending.paramsHash);
  assert.equal(cached, null);

  const tabular = ['col | n', '--|--', 'x | 1'].join('\n');
  await harness.handleFeedback(session.sessionId, tabular);
  const cachedAfter = await cacheManager.resolveFact(session.sessionId, pending.toolName, pending.paramsHash);
  assert.ok(cachedAfter, 'fato deveria estar acessível via cache após armazenamento');
  assert.ok(cachedAfter.rows);
});

test('act em sessão inexistente lança erro', async () => {
  const { harness } = buildHarnessEnvironment();
  await assert.rejects(() => harness.handleAct('nao-existe', 'oi'), /Sessão não encontrada/);
});

test('feedback sem solicitação pendente lança erro', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await assert.rejects(() => harness.handleFeedback(session.sessionId, 'qualquer'), /Não há solicitação pendente/);
});

test('mensagem de criação de skill em sessão ativa ativa Skill Factory', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  const state = await harness.handleAct(session.sessionId, 'Quero criar uma nova skill para detectar empilhar scans');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(state.interview, 'entrevista deveria começar');
  assert.equal(state.interview.totalSteps, 5);
});

test('sessão auto: mensagem com SELECT * seleciona avoid_select_star', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, 'minha query usa select * e fica lenta');
  assert.equal(state.skillName, 'avoid_select_star');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.equal(state.pendingTool.toolName, 'get_query_text');
});

test('sessão auto: mensagem sobre key lookup seleciona key_lookup_elimination', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, 'tem key lookup no plano, quero eliminar');
  assert.equal(state.skillName, 'key_lookup_elimination');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.equal(state.pendingTool.toolName, 'get_execution_plan');
});

test('sessão auto: mensagem sem correspondência cai em general_tuning', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, 'o banco está lento de forma geral');
  assert.equal(state.skillName, 'general_tuning');
  assert.equal(state.state, 'AGUARDANDO_DADO');
});

test('SkillHandoffDetector detecta e remove o marcador de handoff', () => {
  const detector = new SkillHandoffDetector();
  const text = 'Análise feita. [SKILL_HANDOFF:create_assertive_index] Concluído.';
  assert.equal(detector.detect(text), 'create_assertive_index');
  assert.ok(!detector.strip(text).includes('SKILL_HANDOFF'));
  assert.equal(detector.detect('sem marcador'), null);
});

test('handoff troca a skill ativa para create_assertive_index na resposta final', async () => {
  const { harness, sessionManager, skillRegistry } = buildHarnessEnvironment({ llm: new HandoffLlm() });
  const session = sessionManager.create('avoid_non_sargable_predicate');
  const initial = await harness.handleAct(
    session.sessionId,
    'minha query usa YEAR(DataVenda) = 2024 e está lenta',
  );
  assert.equal(initial.state, 'AGUARDANDO_DADO');

  const tabular = ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n');
  const state = await harness.handleFeedback(session.sessionId, tabular);
  assert.equal(state.skillName, 'create_assertive_index', 'skill deveria ter feito handoff');
  assert.ok(skillRegistry.get('create_assertive_index'));
});
