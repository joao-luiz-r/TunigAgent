import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentFacade, WELCOME_MESSAGE } from '../src/application/agent/agent-facade.js';
import { SessionManager } from '../src/application/agent/session-manager.js';
import { SessionCache } from '../src/infra/cache/session-cache.js';
import { buildHarnessEnvironment } from './helpers.js';

test('startSession injeta a mensagem de boas-vindas no histórico', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });

  const state = await facade.startSession('auto');
  assert.ok(state.sessionId);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].role, 'assistant');
  assert.equal(state.messages[0].content, WELCOME_MESSAGE);
  assert.match(WELCOME_MESSAGE, /Online e operacional/);
  assert.match(WELCOME_MESSAGE, /Qual é o cenário\?/);
});

test('startSession da Skill Factory não injeta a saudação (entrevista própria)', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });

  const state = await facade.startSession('skill_factory');
  assert.ok(state.interview, 'entrevista deveria iniciar');
  assert.ok(!state.messages.some((m) => m.content === WELCOME_MESSAGE));
});

test('startSession com skill inexistente lança erro 404', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });

  await assert.rejects(() => facade.startSession('nao_existe'), /não encontrada/);
});

test('act exige sessionId e message', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  await assert.rejects(() => facade.act('', 'oi'), /sessionId/);
  await assert.rejects(() => facade.act('s1', ''), /message/);
  await assert.rejects(() => facade.act('s1', '   '), /message/);
});

test('feedback exige sessionId e userResult', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  await assert.rejects(() => facade.feedback('', 'dado'), /sessionId/);
  await assert.rejects(() => facade.feedback('s1', ''), /userResult/);
});

test('getState retorna 404 para sessão inexistente', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  await assert.rejects(() => facade.getState('nao-existe'), /Sessão não encontrada/);
});

test('listSkills retorna metadados das skills registradas', () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  const skills = facade.listSkills();
  assert.ok(skills.length >= 10);
  assert.ok(skills.some((skill) => skill.name === 'avoid_select_star'));
  assert.ok(skills.every((skill) => Object.keys(skill).sort().join() === 'description,enabled,isFactory,name,source'));
});

test('createSkill valida nome obrigatório', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  await assert.rejects(() => facade.createSkill({ description: 'sem nome' }), /name é obrigatório/);
});

test('createSkill rejeita nome duplicado', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  await assert.rejects(() => facade.createSkill({ name: 'avoid_select_star' }), /Já existe uma skill/);
});

test('createSkill registra skill nova com source factory', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });
  const created = await facade.createSkill({
    name: 'skill_api_nova',
    description: 'desc',
    systemPrompt: 'prompt',
    toolsRequired: ['get_execution_plan'],
  });
  assert.equal(created.name, 'skill_api_nova');
  assert.equal(created.source, 'factory');
  assert.ok(env.skillRegistry.get('skill_api_nova'));
  assert.ok(env.skillRepository.documents.some((d) => d.name === 'skill_api_nova'));

  // Teste com payload sem campos opcionais e com regras de detecção
  const minimal = await facade.createSkill({
    name: 'skill_minimal',
    detectionRules: { type: 'custom' },
    recommendationTemplate: 'rec template',
  });
  assert.equal(minimal.name, 'skill_minimal');
});

test('act, feedback e getState operam ciclo completo com sucesso na facade', async () => {
  const env = buildHarnessEnvironment();
  const facade = new AgentFacade({
    sessionManager: env.sessionManager,
    harness: env.harness,
    skillRegistry: env.skillRegistry,
    skillLoader: env.skillLoader,
  });

  // startSession sem argumento (default para auto)
  const session = await facade.startSession();
  assert.ok(session.sessionId);

  // act com mensagem válida
  const actState = await facade.act(session.sessionId, 'minha query usa SELECT * e fica lenta');
  assert.equal(actState.state, 'AGUARDANDO_DADO');
  assert.ok(actState.pendingTool);

  // getState da sessão ativa
  const currentState = await facade.getState(session.sessionId);
  assert.equal(currentState.sessionId, session.sessionId);
  assert.equal(currentState.state, 'AGUARDANDO_DADO');

  // feedback com resultado de tool
  const finalState = await facade.feedback(
    session.sessionId,
    ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n'),
  );
  assert.equal(finalState.state, 'CONCLUIDO');
  assert.equal(finalState.status, 'COMPLETED');
});

test('SessionManager complete e remove mantém fluxo do cache', () => {
  const sessionCache = new SessionCache();
  const repository = { upsertMetadata: async () => null };
  const manager = new SessionManager({ sessionCache, repository });
  const session = manager.create('avoid_select_star');
  manager.complete(session);
  assert.equal(session.status, 'COMPLETED');
  assert.ok(sessionCache.get(session.sessionId));

  manager.remove(session.sessionId);
  assert.equal(sessionCache.get(session.sessionId), null);
});