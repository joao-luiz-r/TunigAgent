import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { Skill } from '../src/domain/entities/skill.js';
import { buildHarnessSystemPrompt, isolateUserData } from '../src/application/harness/prompt-builder.js';
import { DataChangeDetector } from '../src/application/harness/data-change-detector.js';
import { SkillHandoffDetector } from '../src/application/harness/skill-handoff-detector.js';
import { createGetSkillDetailsTool, normalizeNames } from '../src/application/tools/get-skill-details.tool.js';
import { SkillMatcher, buildSkillSignatures } from '../src/application/skills/skill-matcher.js';

class UnknownToolLlm {
  async createChatCompletion({ system, messages }) {
    return {
      content: null,
      tool_calls: [
        {
          id: `unk_${Date.now()}`,
          type: 'function',
          function: { name: 'funcao_que_nao_existe', arguments: '{}' },
        },
      ],
    };
  }

  async chatJson() {
    return {};
  }
}

class BadArgsLlm {
  async createChatCompletion() {
    return {
      content: null,
      tool_calls: [
        {
          id: 'bad_1',
          type: 'function',
          function: { name: 'get_execution_plan', arguments: '{isso nao e json' },
        },
      ],
    };
  }

  async chatJson() {
    return {};
  }
}

test('feedback em sessão inexistente lança erro', async () => {
  const { harness } = buildHarnessEnvironment();
  await assert.rejects(() => harness.handleFeedback('nao-existe', 'dado'), /Sessão não encontrada/);
});

test('resultado não interpretável mantém sessão aguardando dados com mensagem de erro', async () => {
  const { harness, sessionManager, toolRegistry, skillRegistry } = buildHarnessEnvironment();
  toolRegistry.register({
    name: 'tool_que_falha',
    getDefinition() {
      return { type: 'function', function: { name: 'tool_que_falha', description: 'x', parameters: {} } };
    },
    buildScript() {
      return '-- script';
    },
    computeKey() {
      return 'hash-falha';
    },
    parseResult() {
      throw new Error('parse boom');
    },
  });
  skillRegistry.register(
    new Skill({
      name: 'skill_com_tool_falha',
      description: 'desc',
      systemPrompt: 'use a tool',
      toolsRequired: ['tool_que_falha'],
      source: 'fixed',
    }),
  );
  const session = sessionManager.create('skill_com_tool_falha');
  await harness.handleAct(session.sessionId, 'analise algo');
  const state = await harness.handleFeedback(session.sessionId, 'qualquer coisa');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(
    session.history.some((m) => m.role === 'assistant' && /N[aã]o consegui interpretar/.test(m.content)),
  );
});

test('tool desconhecida do LLM não quebra o loop e registra erro no histórico', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment({ llm: new UnknownToolLlm() });
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'minha query usa select *');
  const toolErrors = session.history.filter((m) => m.role === 'tool');
  assert.ok(toolErrors.length > 0, 'deveria registrar resultados de tool com erro');
  assert.ok(toolErrors.some((m) => /Ferramenta desconhecida/.test(m.content)));
});

test('excesso de iterações sem conclusão devolve mensagem de limite', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment({ llm: new UnknownToolLlm() });
  const session = sessionManager.create('avoid_select_star');
  const state = await harness.handleAct(session.sessionId, 'minha query usa select *');
  assert.equal(state.state, 'CONCLUIDO');
  assert.equal(state.status, 'COMPLETED');
  assert.match(state.finalSuggestion, /excedeu o número máximo de iterações/);
});

test('args inválidos do LLM são tratados como vazio (não quebram o harness)', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment({ llm: new BadArgsLlm() });
  const session = sessionManager.create('avoid_select_star');
  const state = await harness.handleAct(session.sessionId, 'consulta com select *');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(state.pendingTool, 'deveria pedir dado com params vazios tratados');
});

test('resultado cached evita nova solicitação de tool', async () => {
  const { harness, sessionManager, cacheManager, toolRegistry } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  const tool = toolRegistry.get('get_query_text');
  const paramsHash = tool.computeKey({});
  await cacheManager.storeFact(session.sessionId, 'get_query_text', paramsHash, {
    columns: ['texto_consulta', 'execucoes'],
    rows: [{ texto_consulta: 'SELECT * FROM T', execucoes: '5' }],
  });
  const state = await harness.handleAct(session.sessionId, 'query com select *');
  assert.equal(state.state, 'CONCLUIDO', 'fluxo com fato cached deveria concluir sem pedir dados');
  assert.match(state.finalSuggestion, /SELECT \*/);
});

test('applySkillFactoryHint sugere skill quando sessão conclui após correção manual', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  await harness.handleAct(session.sessionId, 'criei um indice com include e a query ficou muito mais rapida');
  const state = await harness.handleFeedback(
    session.sessionId,
    ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n'),
  );
  assert.equal(state.state, 'CONCLUIDO');
  assert.match(state.finalSuggestion, /Quer transform[áa]-la em uma skill reutiliz[áa]vel/);
});

test('lastUserMessage retorna null quando não há mensagem do usuário', () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  assert.equal(harness.lastUserMessage(session), null);
  session.history.push({ role: 'assistant', content: 'oi' });
  assert.equal(harness.lastUserMessage(session), null);
  session.history.push({ role: 'user', content: 'analise' });
  assert.equal(harness.lastUserMessage(session), 'analise');
});

test('act após entrevista da factory concluída responde com confirmação', async () => {
  const { harness, sessionManager, skillRegistry } = buildHarnessEnvironment();
  const session = sessionManager.create('skill_factory');
  await harness.prepareFactorySession(session);

  const factorySteps = FACTORY_ANSWERS;
  let state = session.toPublicState();
  for (let i = 0; i < factorySteps.length; i += 1) {
    state = await harness.handleFeedback(session.sessionId, factorySteps[i]);
  }
  assert.equal(state.state, 'CONCLUIDO');
  assert.ok(skillRegistry.get('indice filtrado para nulos'));

  const after = await harness.handleAct(session.sessionId, 'posso criar outra skill?');
  assert.equal(after.state, 'CONCLUIDO');
  assert.ok(!after.pendingTool, 'não deveria haver tool pendente');
  assert.match(after.finalSuggestion, /entrevista da Skill Factory foi conclu[ií]da/);
});

const FACTORY_ANSWERS = [
  'indice filtrado para nulos',
  'quando o WHERE usa IS NULL em coluna de alta seletividade',
  'preciso do plano de execucao e do schema da tabela',
  'criar um indice filtrado com WHERE coluna IS NULL',
  'CREATE INDEX ix ON dbo.T (c) WHERE c IS NULL;',
  'indice filtrado, is null, coluna is null',
];

test('analyzerExtraSkills captura erro de analyzeSql e retorna []', () => {
  const { harness } = buildHarnessEnvironment();
  const throwing = { toString() { throw new Error('boom'); } };
  const result = harness.analyzerExtraSkills(throwing);
  assert.deepEqual(result, []);
});

test('runDiagnosticLoop faz fallback carregando skill + general_tuning quando loadedSkills vazio', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');
  session.loadedSkills = [];
  session.history.push({ role: 'user', content: 'minha query usa SELECT * e está lenta' });
  await harness.runDiagnosticLoop(session);
  assert.deepEqual(session.loadedSkills, ['avoid_select_star', 'general_tuning']);
  assert.ok(session.pendingTool, 'deveria pausar na primeira tool');
});

test('prompt-builder: cobre variações de loadedSkills, skill legado e isolateUserData', () => {
  const { skillRegistry } = buildHarnessEnvironment();

  // loadedSkills vazio
  const p1 = buildHarnessSystemPrompt({ skillRegistry, loadedSkills: [] });
  assert.match(p1, /\[skill_name: general_tuning\]/);

  // skill legado
  const dummySkill = skillRegistry.get('avoid_select_star');
  const p2 = buildHarnessSystemPrompt({ skillRegistry, skill: dummySkill });
  assert.match(p2, /\[skill_name: avoid_select_star\]/);

  // apenas skillRegistry (sem skill, sem loadedSkills, sem routeHint)
  const p3 = buildHarnessSystemPrompt({ skillRegistry });
  assert.match(p3, /\[skill_name: general_tuning\]/);

  // loadedSkills com 1 item e sem routeHint
  const p4 = buildHarnessSystemPrompt({ skillRegistry, loadedSkills: [dummySkill] });
  assert.match(p4, /\[skill_name: avoid_select_star\]/);

  // isolateUserData com papéis e formatos variados
  const isolated = isolateUserData([
    { role: 'assistant', content: 'resposta' },
    { role: 'user', content: 12345 },
    { role: 'user', content: null },
    { role: 'user', content: 'minha query' },
  ]);
  assert.equal(isolated[0].content, 'resposta');
  assert.equal(isolated[1].content, 12345);
  assert.equal(isolated[2].content, null);
  assert.match(isolated[3].content, /\[\[DADOS_DO_USUARIO_INICIO\]\]/);
});

test('DataChangeDetector: cobre mensagens vazias, apenas objeto, apenas mudança ou ambos', () => {
  const detector = new DataChangeDetector();
  assert.equal(detector.detect(null), false);
  assert.equal(detector.detect(''), false);
  assert.equal(detector.detect('o schema da tabela clientes'), false);
  assert.equal(detector.detect('executei o script no banco'), false);
  assert.equal(detector.detect('criei o indice na tabela'), true);
});

test('SkillHandoffDetector: cobre entradas nulas, vazias e textos sem marcador', () => {
  const detector = new SkillHandoffDetector();
  assert.equal(detector.detect(null), null);
  assert.equal(detector.detect(''), null);
  assert.equal(detector.detect('texto sem marcador'), null);
  assert.equal(detector.strip(null), '');
  assert.equal(detector.strip('texto normal'), 'texto normal');
  assert.equal(detector.strip('texto com [SKILL_HANDOFF: create_assertive_index] marcador'), 'texto com  marcador');
});

test('get-skill-details tool: cobre computeKey, fallback sem getSkill e variações de normalizeNames', () => {
  const toolSemSkill = createGetSkillDetailsTool();
  assert.deepEqual(toolSemSkill.resolve(['avoid_select_star']), []);

  const key1 = toolSemSkill.computeKey({ skills: ['avoid_wildcard_prefix', 'avoid_select_star'] });
  const key2 = toolSemSkill.computeKey({ skills: ['avoid_select_star', 'avoid_wildcard_prefix'] });
  assert.equal(key1, key2, 'computeKey deve ser determinístico e ordenar nomes');

  assert.deepEqual(normalizeNames(null), []);
  assert.deepEqual(normalizeNames(['  a  ', '', 123, 'b']), ['a', 'b']);
  assert.deepEqual(normalizeNames({ skills: ['x'] }), ['x']);
  assert.deepEqual(normalizeNames({ names: ['y'] }), ['y']);
  assert.deepEqual(normalizeNames({ skill: 'z' }), ['z']);
  assert.deepEqual(normalizeNames({ name: 'w' }), ['w']);
  assert.deepEqual(normalizeNames({}), []);
});

test('SkillMatcher: cobre normalize, mensagens vazias e assinaturas com termos curtos/vazios', () => {
  const { skillRegistry } = buildHarnessEnvironment();
  const matcher = new SkillMatcher({ skillRegistry });

  assert.equal(matcher.normalize('Texto Com Acentuação!'), 'texto com acentuacao!');
  assert.equal(matcher.match(''), null);
  assert.equal(matcher.match('   '), null);

  const emptySkill = new Skill({
    name: 'skill_sem_keywords',
    description: 'desc',
    systemPrompt: 'prompt',
    keywords: [],
    source: 'fixed',
  });
  const sigs = buildSkillSignatures([emptySkill]);
  assert.deepEqual(sigs[0].terms, []);
});

test('Harness: cobre branches de ensureLoadedSkills, analyzerExtraSkills e resolveSkillDetailsCall', async () => {
  const { harness, sessionManager, toolRegistry } = buildHarnessEnvironment();
  const session = sessionManager.create('avoid_select_star');

  // ensureLoadedSkills com valores nulos, duplicados, skill inexistente e factory
  harness.ensureLoadedSkills(session, [null, '', 'avoid_select_star', 'skill_inexistente', 'skill_factory']);
  assert.deepEqual(session.loadedSkills, ['avoid_select_star']);

  // analyzerExtraSkills com mensagens e títulos diversos
  const extras = harness.analyzerExtraSkills('SELECT 1');
  assert.ok(Array.isArray(extras));

  // resolveSkillDetailsCall quando a tool get_skill_details é removida do toolRegistry
  const call = {
    id: 'call_1',
    function: { name: 'get_skill_details', arguments: JSON.stringify({ skills: ['avoid_select_star'] }) },
  };
  const originalGet = toolRegistry.get.bind(toolRegistry);
  toolRegistry.get = (name) => (name === 'get_skill_details' ? null : originalGet(name));
  await harness.resolveSkillDetailsCall(session, call);
  toolRegistry.get = originalGet;

  const toolMsg = session.history[session.history.length - 1];
  assert.equal(toolMsg.role === 'tool' && JSON.parse(toolMsg.content).skills.length, 0);
});