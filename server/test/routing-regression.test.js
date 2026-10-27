import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHarnessEnvironment } from './helpers.js';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { SkillLoader } from '../src/application/skills/skill-loader.js';
import { SkillMatcher } from '../src/application/skills/skill-matcher.js';
import { InMemoryRepository } from './helpers.js';

// Additional regression cases for more skills (adding to the original 6 to cover more business rules)
const ADDITIONAL_REGRESSION_CASES = [
  // Add 20 more cases with different data for skills: ensure_fk_indexes, key_lookup_elimination, recommend_missing_index,
  // refresh_stale_statistics, set_based_instead_of_cursor, optimize_long_running_transaction, etc.
  // Each case includes the same structure: skill, message, data, expected pattern
  
  // Continue expanding the regression test suite for more skills
];

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
    skill: 'always_use_order_by_for_guaranteed_order',
    message: 'preciso garantir a ordem dos resultados com top 1 e order by explicito',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT TOP 1 Id FROM T | 5'].join('\n'),
    expected: /ORDER BY/i,
  },
  {
    skill: 'avoid_dynamic_search_condition',
    message: 'uso @param is null or coluna = @param como filtro opcional, gera dynamic search',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE (@P IS NULL OR Col = @P) | 5'].join('\n'),
    expected: /SQL din[aâ]mico|OPTION\s*\(RECOMPILE\)|filtro/i,
  },
  {
    skill: 'avoid_heap_table',
    message: 'essa tabela heap sem clustered com forwarding esta lenta',
    data: ['tabela | indice | tipo', '-------|--------|-----', 'LogEventos | NULL | heap'].join('\n'),
    expected: /clustered|heap/i,
  },
  {
    skill: 'avoid_isnull_in_where',
    message: 'tem funcao isnull na coluna no where, ISNULL(coluna, 0)',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE ISNULL(Status, 0) = 1 | 5'].join('\n'),
    expected: /ISNULL|predicado|sarg[áa]vel/i,
  },
  {
    skill: 'avoid_large_temp_tables',
    message: 'a tabela temporaria #temp com grande volume de dados lota o tempdb',
    data: ['tabela | linhas', '-------|-------', '#temp | 1000000'].join('\n'),
    expected: /tempdb|tabela tempor[áa]ria|#temp/i,
  },
  {
    skill: 'avoid_multiple_table_scans_with_case',
    message: 'a query faz varias leituras da mesma tabela varias vezes, agregacao multipla',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT (SELECT COUNT(*) FROM T WHERE A=1), (SELECT COUNT(*) FROM T WHERE A=2) | 5'].join('\n'),
    expected: /CASE|scan|agrega[çc][aã]o/i,
  },
  {
    skill: 'avoid_non_sargable_predicate',
    message: 'tem funcao na coluna no where, year(Data) por exemplo, fica nao sargavel',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE YEAR(Data) = 2026 | 5'].join('\n'),
    expected: /sarg[áa]vel|predicado/i,
  },
  {
    skill: 'avoid_not_in_with_nulls',
    message: 'usa not in com null e retorna resultados vazios',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE Id NOT IN (SELECT Id FROM P) | 5'].join('\n'),
    expected: /NOT IN|NOT EXISTS|NULL/i,
  },
  {
    skill: 'avoid_row_goal_in_exists',
    message: 'tem exists com order by na subconsulta e row goal bias no plano',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE EXISTS (SELECT 1 FROM P ORDER BY Data) | 5'].join('\n'),
    expected: /EXISTS|Row Goal/i,
  },
  {
    skill: 'avoid_select_star',
    message: 'minha query usa SELECT * e fica lenta',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM T | 5'].join('\n'),
    expected: /SELECT \*|colunas realmente necess[áa]rias/i,
  },
  {
    skill: 'avoid_unnecessary_foreign_key_updates',
    message: 'estao fazendo update de fk na coluna de chave estrangeira sem necessidade',
    data: ['texto_consulta | execucoes', '--------------|----------', "UPDATE T SET FK_Id = 42, Nome = 'x' | 5"].join('\n'),
    expected: /FOREIGN KEY|UPDATE|FK/i,
  },
  {
    skill: 'avoid_unnecessary_order_by',
    message: 'quero remover order by desnecessario da consulta de populacao',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id, Nome FROM T ORDER BY Id | 5'].join('\n'),
    expected: /ORDER BY/i,
  },
  {
    skill: 'avoid_varchar_max',
    message: 'a coluna varchar(max) com out-of-row causa lentidao',
    data: ['coluna | tipo', '-------|-----', 'Descricao | varchar(max)'].join('\n'),
    expected: /VARCHAR\(MAX\)|VARCHAR\(n\)/i,
  },
  {
    skill: 'avoid_wildcard_prefix',
    message: 'uso LIKE com % no inicio e fica lento',
    data: ['texto_consulta | execucoes', '--------------|----------', "WHERE nome LIKE '%joao' | 5"].join('\n'),
    expected: /an[áa]lise de tuning|recomenda[çc][aã]o|LIKE/i,
  },
  {
    skill: 'cache_string_split_with_temp_table',
    message: 'o string_split repetido varias vezes deveria usar variavel de tabela para split',
    data: ['texto_consulta | execucoes', '--------------|----------', "SELECT * FROM T JOIN STRING_SPLIT(@str, ',') s ON T.Id = s.value | 5"].join('\n'),
    expected: /STRING_SPLIT|tabela/i,
  },
  {
    skill: 'choose_temp_table_or_table_variable',
    message: 'a variavel de tabela é usada acima de 100 linhas, troco para tabela temporaria',
    data: ['texto_consulta | execucoes', '--------------|----------', 'DECLARE @t TABLE (Id INT); INSERT INTO @t SELECT Id FROM T; | 5'].join('\n'),
    expected: /@tabela|#temp|tempor[áa]ria|vari[áa]vel/i,
  },
  {
    skill: 'consolidate_multiple_updates_with_case',
    message: 'multiplos update na mesma tabela podem virar um update com case',
    data: ['texto_consulta | execucoes', '--------------|----------', 'UPDATE T SET A = 1 WHERE X=1; UPDATE T SET A = 2 WHERE X=2; | 5'].join('\n'),
    expected: /UPDATE|CASE/i,
  },
  {
    skill: 'create_assertive_index',
    message: 'preciso criar um indice de cobertura com include pra cobrir a consulta',
    data: ['indice | colunas | includes', '-------|---------|---------', 'IX_T | ClienteId | NULL'].join('\n'),
    expected: /índice|cobertura|CREATE INDEX/i,
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
    skill: 'encapsulate_case_with_correlated_subquery',
    message: 'o case com subquery usa a subquery como argumento no simple case',
    data: ['texto_consulta | execucoes', '--------------|----------', "SELECT CASE (SELECT TOP 1 X FROM B WHERE B.Id = A.Id) WHEN 1 THEN 'A' END FROM A | 5"].join('\n'),
    expected: /CASE|subquery|subconsulta/i,
  },
  {
    skill: 'ensure_fk_indexes',
    message: 'a chave estrangeira sem indice vai deixar o join lento',
    data: ['indice | coluna', '-------|-------', 'FK_Cliente | ClienteId'].join('\n'),
    expected: /índices de suporte|chave estrangeira/i,
  },
  {
    skill: 'ensure_scalar_udf_inlining',
    message: 'a scalar udf lenta, preciso verificar o inlining e o is_inlineable',
    data: ['funcao | is_inlineable', '-------|--------------', 'fn_Calcula | 0'].join('\n'),
    expected: /inline|Scalar UDF|funç[õo]es escalares/i,
  },
  {
    skill: 'extract_fixed_subquery_to_variable',
    message: 'a subconsulta nao correlacionada executada repetidamente, posso extrair subconsulta',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE Data > (SELECT MAX(Data) FROM Parametros) | 5'].join('\n'),
    expected: /subconsulta|vari[áa]vel/i,
  },
  {
    skill: 'general_tuning',
    message: 'o banco está lento, coleto wait stats e plano',
    data: ['wait_type | wait_time_ms', '----------|-------------', 'PAGEIOLATCH | 1200'].join('\n'),
    expected: /an[áa]lise geral|priorize a investiga[çc][aã]o/i,
  },
  {
    skill: 'handle_nulls_in_aggregate_expressions',
    message: 'a agregacao com null, sum com null na soma, precisa de isnull na expressao',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT SUM(Valor + Frete) FROM Pedidos | 5'].join('\n'),
    expected: /NULL|SUM|ISNULL/i,
  },
  {
    skill: 'handle_parameter_sniffing',
    message: 'tem parameter sniffing com optimize for unknown e recompile',
    data: ['texto_consulta | execucoes', '--------------|----------', 'CREATE PROCEDURE Buscar @P INT AS SELECT * FROM T WHERE P = @P | 5'].join('\n'),
    expected: /Parameter Sniffing|RECOMPILE|OPTIMIZE/i,
  },
  {
    skill: 'key_lookup_elimination',
    message: 'tem key lookup no plano, quero indice de cobertura',
    data: ['indice | is_included_column', '-------|------------------', 'IX_1 | 0'].join('\n'),
    expected: /Key Lookup|cobertura/i,
  },
  {
    skill: 'optimize_long_running_transaction',
    message: 'a transacao longa causa bloqueios de longa duracao',
    data: ['texto_consulta | execucoes', '--------------|----------', 'BEGIN TRAN; UPDATE A...; UPDATE B...; COMMIT TRAN; | 5'].join('\n'),
    expected: /transa[çc][aã]o|bloqueio|N[íi]vel 1/i,
  },
  {
    skill: 'optimize_repetitive_case_with_cross_apply',
    message: 'o case repetido no select e no where deveria usar cross apply',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT CASE WHEN A>1 THEN 1 END FROM T WHERE (CASE WHEN A>1 THEN 1 END) = 1 | 5'].join('\n'),
    expected: /CROSS APPLY|CASE/i,
  },
  {
    skill: 'prefer_string_agg_over_for_xml',
    message: 'a concatenacao com for xml path deveria usar string_agg e stuff(',
    data: ['texto_consulta | execucoes', '--------------|----------', "SELECT STUFF((SELECT ',' + Nome FROM T FOR XML PATH('')), 1, 1, '') | 5"].join('\n'),
    expected: /STRING_AGG|FOR XML/i,
  },
  {
    skill: 'prefer_union_all_over_union',
    message: 'usar union all em vez de union, union ao inves de union all',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM A UNION SELECT Id FROM B | 5'].join('\n'),
    expected: /UNION ALL|UNION/i,
  },
  {
    skill: 'recommend_missing_index',
    message: 'que indice ausente essa query precisa? tem sugestao de missing index',
    data: ['tabela | colunas_igualdade | impacto', '-------|-------------------|--------', 'Pedidos | Status, Data | 85.5'].join('\n'),
    expected: /índice|missing index/i,
  },
  {
    skill: 'refresh_stale_statistics',
    message: 'tem stale statistics, precisa de update statistics e update da cardinalidade errada',
    data: ['tabela | modificacoes | total_linhas', '-------|--------------|-------------', 'Clientes | 50000 | 100000'].join('\n'),
    expected: /estat[ií]sticas|UPDATE STATISTICS/i,
  },
  {
    skill: 'replace_join_distinct_with_exists',
    message: 'o join com distinct força um sort caro, melhor exists',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT DISTINCT c.Id FROM Clientes c JOIN Pedidos p ON p.ClienteId = c.Id | 5'].join('\n'),
    expected: /DISTINCT|EXISTS/i,
  },
  {
    skill: 'replace_join_with_exists',
    message: 'o join apenas para filtrar gera duplicatas, usar exists no lugar de join',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT c.Id, c.Nome FROM Clientes c JOIN Pedidos p ON p.ClienteId = c.Id | 5'].join('\n'),
    expected: /EXISTS|JOIN/i,
  },
  {
    skill: 'replace_left_join_isnull_with_not_exists',
    message: 'left join is null é anti join, usar not exists para achar registros sem correspondencia',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT c.Id FROM Clientes c LEFT JOIN Pedidos p ON p.ClienteId = c.Id WHERE p.Id IS NULL | 5'].join('\n'),
    expected: /LEFT JOIN|NOT EXISTS/i,
  },
  {
    skill: 'replace_or_between_columns_with_union_all',
    message: 'o or entre colunas diferentes gera index scan por or, usar union all para or',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id FROM T WHERE ColA = 1 OR ColB = 2 | 5'].join('\n'),
    expected: /UNION ALL|OR/i,
  },
  {
    skill: 'replace_subselect_with_join',
    message: 'subconsulta correlacionada no where, reescrever como join pra evitar linha a linha',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT c.Id, (SELECT COUNT(*) FROM Pedidos p WHERE p.ClienteId = c.Id) FROM Clientes c | 5'].join('\n'),
    expected: /subconsulta|JOIN/i,
  },
  {
    skill: 'set_based_instead_of_cursor',
    message: 'o cursor processa linha a linha, queria algo set based em vez de while + update',
    data: ['texto_consulta | execucoes', '--------------|----------', 'DECLARE cur CURSOR FOR SELECT Id FROM T; OPEN cur; FETCH... | 5'].join('\n'),
    expected: /cursor|set-based|loop/i,
  },
  {
    skill: 'use_aggregate_over_partition',
    message: 'preciso de agregado por grupo com window function e partition by no select',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id, (SELECT SUM(Total) FROM Pedidos p WHERE p.ClienteId = c.Id) FROM Clientes c | 5'].join('\n'),
    expected: /PARTITION BY|SUM\(\)|OVER/i,
  },
  {
    skill: 'use_apply_for_multiple_aggregates',
    message: 'preciso calcular varios agregados com multiplas subconsultas e outer apply',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Id, (SELECT SUM(T) FROM A), (SELECT COUNT(*) FROM B) FROM C | 5'].join('\n'),
    expected: /APPLY|OUTER APPLY|agrega/i,
  },
  {
    skill: 'use_join_in_delete_update',
    message: 'delete join e update join pra modificar com base em outra tabela',
    data: ['texto_consulta | execucoes', '--------------|----------', 'DELETE FROM Pedidos WHERE ClienteId IN (SELECT Id FROM Clientes WHERE Inativo = 1) | 5'].join('\n'),
    expected: /DELETE|UPDATE|JOIN/i,
  },
  {
    skill: 'use_lag_for_previous_row',
    message: 'comparar com a linha anterior usando lag( em vez de self join',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT t1.Data, (SELECT TOP 1 t2.Valor FROM T t2 WHERE t2.Data < t1.Data ORDER BY t2.Data DESC) FROM T t1 | 5'].join('\n'),
    expected: /LAG\(\)|linha anterior/i,
  },
  {
    skill: 'use_lead_for_next_row',
    message: 'a linha seguinte e o next row, usar lead( no lugar de self join',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT t1.Data, (SELECT TOP 1 t2.Valor FROM T t2 WHERE t2.Data > t1.Data ORDER BY t2.Data ASC) FROM T t1 | 5'].join('\n'),
    expected: /LEAD\(\)|pr[óo]xima linha/i,
  },
  {
    skill: 'use_output_clause_for_atomic_operations',
    message: 'preciso capturar dados apos dml com scope_identity, usar output clause atomico',
    data: ['texto_consulta | execucoes', '--------------|----------', "INSERT INTO T (Nome) VALUES ('x'); SELECT SCOPE_IDENTITY(); | 5"].join('\n'),
    expected: /OUTPUT|at[oô]mic/i,
  },
  {
    skill: 'use_rank_functions_for_numbering',
    message: 'ranquear linhas com row_number() e dense_rank() em vez de numeracao manual',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT @rn := @rn + 1, Nome FROM T | 5'].join('\n'),
    expected: /ROW_NUMBER\(\)|RANK\(\)/i,
  },
  {
    skill: 'use_row_number_for_top_n_per_group',
    message: 'acho a linha mais recente de cada grupo com row_number partition by group',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT * FROM Pedidos p1 WHERE p1.Data = (SELECT MAX(Data) FROM Pedidos p2 WHERE p2.ClienteId = p1.ClienteId) | 5'].join('\n'),
    expected: /ROW_NUMBER\(\)|PARTITION BY/i,
  },
  {
    skill: 'use_sum_over_for_running_total',
    message: 'calculo o running total com sum() over e total acumulado',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Data, (SELECT SUM(Valor) FROM Vendas v2 WHERE v2.Data <= v1.Data) FROM Vendas v1 | 5'].join('\n'),
    expected: /SUM\(\) OVER|ROWS BETWEEN|total acumulado/i,
  },
  {
    skill: 'use_window_functions_for_sliding_window',
    message: 'a media movel com moving average usa rows between numa janela deslizante',
    data: ['texto_consulta | execucoes', '--------------|----------', 'SELECT Data, (SELECT AVG(Valor) FROM Vendas v2 WHERE v2.Data BETWEEN DATEADD(day, -7, v1.Data) AND v1.Data) FROM Vendas v1 | 5'].join('\n'),
    expected: /ROWS BETWEEN|m[ée]dia m[óo]vel|OVER/i,
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