import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { Skill } from '../src/domain/entities/skill.js';

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
];