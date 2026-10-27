import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { SkillGenerator } from '../src/application/skill-factory/skill-generator.js';
import { SkillFactoryDetector } from '../src/application/skill-factory/skill-factory-detector.js';
import { INTERVIEW_STEPS, FACTORY_SKILL_NAME } from '../src/application/skill-factory/interview-steps.js';
import { MockLlm } from '../src/infra/llm/mock-llm.js';
import { SkillMatcher } from '../src/application/skills/skill-matcher.js';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { ToolRegistry } from '../src/application/tools/tool-registry.js';
import { registerAllTools } from '../src/application/tools/register-tools.js';
import { skillToMarkdown } from '../src/application/skills/skill-md-writer.js';

test('entrevista completa cria skill dinâmica e registra na biblioteca', async () => {
  const { harness, sessionManager, skillRegistry, skillRepository } = buildHarnessEnvironment();
  const session = sessionManager.create(FACTORY_SKILL_NAME);
  await harness.prepareFactorySession(session);

  const answers = [
    'indice filtrado para nulos',
    'quando o WHERE usa IS NULL em coluna de alta seletividade',
    'preciso do plano de execucao e do schema da tabela',
    'criar um indice filtrado com WHERE coluna IS NULL',
    'CREATE INDEX ix ON dbo.T (c) WHERE c IS NULL;',
    'indice filtrado, is null, coluna is null',
  ];

  let state = session.toPublicState();
  for (const answer of answers) {
    state = await harness.handleFeedback(session.sessionId, answer);
  }

  assert.equal(state.state, 'CONCLUIDO');
  assert.equal(state.status, 'COMPLETED');
  assert.match(state.finalSuggestion, /"indice filtrado para nulos" criada com sucesso/);

  const created = skillRegistry.get('indice filtrado para nulos');
  assert.ok(created, 'skill deveria estar registrada');
  assert.equal(created.source, 'factory');
  assert.ok(created.toolsRequired.length > 0, 'tools deveriam ser inferidas');
  assert.ok(created.keywords.includes('is null'), 'keywords da entrevista deveriam ser extraídas');
  assert.ok(skillRepository.documents.some((d) => d.name === 'indice filtrado para nulos'));
});

test('tools são inferidas a partir dos dados necessários', () => {
  const llm = new MockLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });

  const tools = generator.inferTools('preciso do plano de execução e do schema da tabela');
  assert.ok(tools.includes('get_execution_plan'));
  assert.ok(tools.includes('get_table_schema'));
});

test('inferTools cai no fallback get_execution_plan quando não reconhece', () => {
  const llm = new MockLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });
  assert.deepEqual(generator.inferTools('informações genéricas'), ['get_execution_plan']);
});

test('generate produz documento de skill válido com fallback do mock', async () => {
  const llm = new MockLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });

  const skill = await generator.generate({
    name: 'tecnica x',
    trigger: 'quando aparece X',
    dataNeeded: 'plano de execução',
    recommendation: 'fazer Y',
    script: '-- script',
  });
  assert.equal(skill.name, 'tecnica x');
  assert.ok(skill.systemPrompt && skill.systemPrompt.length > 0);
  assert.ok(skill.toolsRequired.includes('get_execution_plan'));
  assert.equal(skill.source, 'factory');
});

test('detector reconhece pedido de criação de skill', () => {
  const detector = new SkillFactoryDetector();
  assert.ok(detector.isCreationRequest('quero criar uma skill para detectar X'));
  assert.ok(detector.isCreationRequest('Quero criar uma nova skill'));
  assert.ok(!detector.isCreationRequest('minha query está lenta'));
});

test('detector reconhece correção manual com melhoria reportada', () => {
  const detector = new SkillFactoryDetector();
  assert.ok(
    detector.detect(
      'criei um indice filtrado e a query ficou muito mais rápida agora',
    ),
  );
  assert.ok(!detector.detect('qual a capital do brasil?'));
});

test('entrevista registra respostas e avança pelas etapas', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create(FACTORY_SKILL_NAME);
  await harness.prepareFactorySession(session);

  const state = await harness.handleFeedback(session.sessionId, 'nome da tecnica');
  assert.equal(state.interview.stepIndex, 2);
  assert.equal(state.interview.answers.name, 'nome da tecnica');
  assert.equal(state.state, 'AGUARDANDO_DADO');
});

test('INTERVIEW_STEPS segue o roteiro fixo da especificação', () => {
  assert.deepEqual(
    INTERVIEW_STEPS.map((step) => step.key),
    ['name', 'trigger', 'dataNeeded', 'recommendation', 'script', 'keywords'],
  );
  assert.equal(INTERVIEW_STEPS[4].optional, true);
  assert.equal(INTERVIEW_STEPS[5].optional, false);
});

class FailingLlm extends MockLlm {
  async chatJson() {
    throw new Error('LLM fora do ar');
  }
}

test('generate usa fallback quando o LLM falha', async () => {
  const llm = new FailingLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });

  const skill = await generator.generate({
    name: 'tecnica fallback',
    trigger: 'quando aparece Y',
    dataNeeded: 'preciso do schema da tabela',
    recommendation: 'criar indice',
    script: '-- script x',
  });
  assert.equal(skill.name, 'tecnica fallback');
  assert.ok(skill.systemPrompt.length > 0);
  assert.ok(skill.toolsRequired.includes('get_table_schema'));
  assert.match(skill.systemPrompt, /tecnica fallback/);
});

test('fallback não inventa Script ANTES duplicando o de correção', async () => {
  const llm = new FailingLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });

  const skill = await generator.generate({
    name: 'tecnica sem antes',
    trigger: 'quando aparece Z',
    dataNeeded: 'plano de execução',
    recommendation: 'reescrever com APPLY',
    script: 'SELECT 1;',
  });
  assert.equal(skill.pattern.beforeScript, '');
  assert.equal(skill.pattern.afterScript, 'SELECT 1;');
  const markdown = skillToMarkdown(skill);
  assert.doesNotMatch(markdown, /Script ANTES/);
  assert.match(markdown, /Script DEPOIS/);
});

test('generate extrai keywords separadas por vírgula/ponto-vírgula', async () => {
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm: new MockLlm(), toolRegistry: registry });

  const skill = await generator.generate({
    name: 'tecnica keywords',
    trigger: 'quando aparece W',
    dataNeeded: 'plano de execução',
    recommendation: 'reescrever',
    script: 'SELECT 1;',
    keywords: 'Outer Apply; subselect correlacionado,  top 1 ',
  });
  assert.deepEqual(skill.keywords, ['outer apply', 'subselect correlacionado', 'top 1']);
});

test('skill de factory com keywords passa a ser roteada pelo matcher', async () => {
  const toolRegistry = new ToolRegistry();
  registerAllTools(toolRegistry);
  const generator = new SkillGenerator({ llm: new MockLlm(), toolRegistry });

  const base = {
    trigger: 'subselects correlacionados',
    dataNeeded: 'texto da consulta e plano de execução',
    recommendation: 'reescrever com outer apply',
    script: 'SELECT 1;',
  };
  const withKeywords = await generator.generate({
    ...base,
    name: 'skill_outer_apply_teste',
    keywords: 'outer apply, subselect correlacionado',
  });
  const withoutKeywords = await generator.generate({ ...base, name: 'skill_muda', keywords: '' });

  const message = 'minha query tem subselect correlacionado, quero usar outer apply';

  const registry = new SkillRegistry();
  registry.register(withKeywords);
  assert.equal(new SkillMatcher({ skillRegistry: registry }).match(message).name, 'skill_outer_apply_teste');

  const emptyRegistry = new SkillRegistry();
  emptyRegistry.register(withoutKeywords);
  assert.equal(new SkillMatcher({ skillRegistry: emptyRegistry }).match(message), null);
});

test('fallback usa o SQL de origem da sessão como Script ANTES', async () => {
  const llm = new FailingLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });

  const withOrigin = await generator.generate(
    { name: 't', trigger: 'x', dataNeeded: 'y', recommendation: 'z', script: 'SELECT 1;' },
    { beforeScript: 'SELECT * FROM T;' },
  );
  assert.equal(withOrigin.pattern.beforeScript, 'SELECT * FROM T;');
  assert.equal(withOrigin.pattern.afterScript, 'SELECT 1;');

  const withoutOrigin = await generator.generate(
    { name: 't', trigger: 'x', dataNeeded: 'y', recommendation: 'z', script: 'SELECT 1;' },
  );
  assert.equal(withoutOrigin.pattern.beforeScript, '');
});

test('skill criada via factory carrega o SQL de origem como ANTES', async () => {
  const { harness, sessionManager, skillRegistry } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  await harness.handleAct(session.sessionId, 'SELECT * FROM Pedidos WHERE ClienteId = 42;');

  const factoryState = await harness.handleAct(session.sessionId, 'quero criar uma skill');
  const factoryId = factoryState.sessionId;
  const answers = [
    'skill_origem_teste',
    'quando aparece W',
    'texto da consulta',
    'reescrever',
    'SELECT 1;',
    'origem, teste',
  ];
  let state = factoryState;
  for (const answer of answers) {
    state = await harness.handleFeedback(factoryId, answer);
  }
  assert.equal(state.state, 'CONCLUIDO');
  const created = skillRegistry.get('skill_origem_teste');
  assert.ok(created);
  assert.match(created.pattern.beforeScript, /SELECT \* FROM Pedidos/);
  assert.equal(created.pattern.afterScript, 'SELECT 1;');
});

test('geração dinâmica confirma manualmente sete nome mesmo com LLM mock', async () => {
  const llm = new MockLlm();
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const generator = new SkillGenerator({ llm, toolRegistry: registry });
  const skill = await generator.generate({
    name: '   ',
    trigger: 'X',
  });
  assert.equal(skill.name, 'nova_skill');
});

test('detector reconhece variações de pedido de criação de skill', () => {
  const detector = new SkillFactoryDetector();
  assert.ok(detector.isCreationRequest('quero criar uma skill para detectar X'));
  assert.ok(detector.isCreationRequest('Quero criar uma nova skill'));
  assert.ok(detector.isCreationRequest('gostaria de ensinar uma nova tecnica de tuning'));
  assert.ok(detector.isCreationRequest('skill factory'));
  assert.ok(detector.isCreationRequest('transformar essa correção em uma skill'));
  assert.ok(!detector.isCreationRequest('minha query está lenta'));
  assert.ok(!detector.isCreationRequest('qual a capital do brasil?'));
});

test('detector não acusa correção manual em mensagens sem melhoria', () => {
  const detector = new SkillFactoryDetector();
  assert.ok(!detector.detect('ainda está lenta, preciso de ajuda'));
  assert.ok(!detector.detect('vou dropar o índice amanhã'));
});

test('InterviewController registra resposta mesmo para step inexistente', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create(FACTORY_SKILL_NAME);
  await harness.prepareFactorySession(session);
  session.interview.currentIndex = -1;
  const controller = harness.interviewController;
  controller.recordAnswer(session, 'x');
  assert.deepEqual(session.interview.answers, {});
});
