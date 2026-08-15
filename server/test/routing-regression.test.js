import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { SkillLoader } from '../src/application/skills/skill-loader.js';
import { SkillMatcher } from '../src/application/skills/skill-matcher.js';
import { InMemoryRepository } from './helpers.js';

const COMPLEX_QUERY = `SELECT *
FROM Clientes c
INNER JOIN Pedidos p ON p.ClienteId = c.Id
LEFT JOIN Vendas v ON v.ClienteId = c.Id
WHERE c.Status = 'Ativo'
  AND YEAR(c.DataCadastro) = 2024
ORDER BY p.Total DESC`;

const AMBIGUOUS_MESSAGES = [
  'o banco está lento de forma geral',
  'a query demora muito, não sei por onde começar',
  'preciso melhorar a performance do sistema',
  'está tudo lento hoje',
  'o que devo fazer com essa lentidão?',
  'me ajude, não sei diagnosticar',
];

const TRAP_MESSAGES = [
  'preciso unir dois resultados, tem unite?',
  'o indice que voce viu faz parte de outra tabela',
  'estou estudando o plano que o banco gerou ontem',
  'quero ver o plano de voo do aviao',
  'quantas linhas tem a tabela, conte tudo',
  'o count esta correto na minha planilha',
];

const REGRESSION_CASES = [
  {
    skill: 'avoid_select_star',
    message: 'minha query usa SELECT * e fica lenta',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n'),
    expected: /SELECT \*|colunas realmente necess[áa]rias/i,
  },
  {
    skill: 'detect_implicit_conversion',
    message: 'a coluna varchar é comparada com nvarchar',
    data: [
      'coluna | tipo | coluna_ref | tipo_ref',
      '-------|------|-----------|---------',
      'Nome   | varchar | Nome | nvarchar',
    ].join('\n'),
    expected: /convers[õo]es impl[ií]citas/i,
  },
  {
    skill: 'ensure_fk_indexes',
    message: 'a chave estrangeira sem indice vai deixar o join lento',
    data: ['indice | coluna', '-------|-------', 'FK_Cliente | ClienteId'].join('\n'),
    expected: /índices de suporte|chave estrangeira/i,
  },
  {
    skill: 'key_lookup_elimination',
    message: 'tem key lookup no plano, quero indice de cobertura',
    data: ['indice | is_included_column', '-------|------------------', 'IX_1 | 0'].join('\n'),
    expected: /Key Lookup|cobertura/i,
  },
  {
    skill: 'general_tuning',
    message: 'o banco está lento, coleto wait stats e plano',
    data: ['wait_type | wait_time_ms', '----------|-------------', 'PAGEIOLATCH | 1200'].join('\n'),
    expected: /an[áa]lise geral|priorize a investiga[çc][aã]o/i,
  },
  {
    skill: 'avoid_wildcard_prefix',
    message: 'uso LIKE com % no inicio e fica lento',
    data: ['texto_consulta | execucoes', '--------------|----------', "WHERE nome LIKE '%joao' | 5"].join('\n'),
    expected: /an[áa]lise de tuning|recomenda[çc][aã]o/i,
  },
];

test('E2E query complexa: roteia, coleta dados e conclui com recomendação', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, COMPLEX_QUERY);
  assert.equal(state.skillName, 'avoid_select_star');
  assert.equal(state.state, 'AGUARDANDO_DADO');
  assert.ok(state.pendingTool);

  const final = await harness.handleFeedback(
    session.sessionId,
    ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n'),
  );
  assert.equal(final.state, 'CONCLUIDO');
  assert.equal(final.status, 'COMPLETED');
  assert.ok(final.finalSuggestion.length > 0);
  assert.match(final.finalSuggestion, /SELECT \*/);
});

test('E2E query complexa específica da skill com roteamento automático', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, COMPLEX_QUERY);
  assert.equal(state.pendingTool.toolName, 'get_query_text');

  const withStar = await harness.handleFeedback(
    session.sessionId,
    ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM Pedidos | 5'].join('\n'),
  );
  assert.equal(withStar.state, 'CONCLUIDO');
  assert.doesNotMatch(withStar.finalSuggestion, /excedeu o n[uú]mero m[áa]ximo/);
});

test('regressão por skill: fluxo canônico conclui com recomendação esperada', async () => {
  for (const { skill, message, data, expected } of REGRESSION_CASES) {
    const { harness, sessionManager } = buildHarnessEnvironment();
    const session = sessionManager.create(skill);
    const initial = await harness.handleAct(session.sessionId, message);
    assert.equal(initial.skillName, skill, `skill ${skill} deveria ser a ativa`);
    assert.equal(initial.state, 'AGUARDANDO_DADO', `skill ${skill} deveria pedir tool`);

    const final = await harness.handleFeedback(session.sessionId, data);
    assert.equal(final.state, 'CONCLUIDO', `skill ${skill} deveria concluir`);
    assert.equal(final.status, 'COMPLETED', `skill ${skill} deveria estar COMPLETED`);
    assert.ok(final.finalSuggestion && final.finalSuggestion.length > 0, `skill ${skill} com sugestão vazia`);
    assert.match(final.finalSuggestion, expected, `skill ${skill} com recomendação inesperada`);
  }
});

test('todas as 48 skills fixas concluem o ciclo de regressão sem exceção', async () => {
  const { harness, sessionManager, skillRegistry } = buildHarnessEnvironment();
  const data = ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n');

  const targets = skillRegistry
    .all()
    .filter((skill) => !skill.isFactory && skill.name !== 'general_tuning' && skill.name !== 'skill_factory')
    .map((skill) => skill.name);

  assert.equal(targets.length, 48, 'esperado 48 skills fixas de diagnóstico');

  for (const name of targets) {
    const session = sessionManager.create(name);
    const initial = await harness.handleAct(session.sessionId, `diagnostique usando a skill ${name}`);
    assert.equal(initial.skillName, name);
    assert.ok(initial.state === 'AGUARDANDO_DADO' || initial.state === 'CONCLUIDO');

    if (initial.state === 'AGUARDANDO_DADO') {
      const final = await harness.handleFeedback(session.sessionId, data);
      assert.equal(final.state, 'CONCLUIDO', `skill ${name} não concluiu`);
      assert.ok(final.finalSuggestion && final.finalSuggestion.length > 0, `skill ${name} sem sugestão`);
    }
  }
});

test('sanidade: mensagens ambíguas não selecionam nenhuma skill específica', () => {
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository: new InMemoryRepository(), registry });
  loader.loadFixed();
  const matcher = new SkillMatcher({ skillRegistry: registry });

  for (const message of AMBIGUOUS_MESSAGES) {
    assert.equal(matcher.match(message), null, `"${message}" não deveria escolher skill alguma`);
  }
});

test('sanidade: mensagens armadilha não enganam o matcher', () => {
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository: new InMemoryRepository(), registry });
  loader.loadFixed();
  const matcher = new SkillMatcher({ skillRegistry: registry });

  for (const message of TRAP_MESSAGES) {
    const matched = matcher.match(message);
    assert.ok(matched === null, `"${message}" não deveria escolher skill (escolheu ${matched && matched.name})`);
  }
});

test('sanidade: mensagem com seleção ambígua roteia para general_tuning no harness', async () => {
  const { harness, sessionManager } = buildHarnessEnvironment();
  const session = sessionManager.create('auto');
  const state = await harness.handleAct(session.sessionId, 'o banco está lento mas não sei qual a causa');
  assert.equal(state.skillName, 'general_tuning');
});