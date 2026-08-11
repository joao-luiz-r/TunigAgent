import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentFacade, WELCOME_MESSAGE } from '../src/application/agent/agent-facade.js';
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