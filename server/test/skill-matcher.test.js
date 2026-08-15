import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { SkillLoader } from '../src/application/skills/skill-loader.js';
import { SkillMatcher } from '../src/application/skills/skill-matcher.js';
import { InMemoryRepository } from './helpers.js';

const ROUTING_CASES = [
  {
    message: 'minha query usa select * e fica lenta',
    expected: 'avoid_select_star',
  },
  {
    message: 'a coluna varchar é comparada com nvarchar, tem conversao implicita de tipo',
    expected: 'detect_implicit_conversion',
  },
  {
    message: 'a chave estrangeira sem indice vai deixar o join lento',
    expected: 'ensure_fk_indexes',
  },
  {
    message: 'tem key lookup no plano e preciso de um indice de cobertura',
    expected: 'key_lookup_elimination',
  },
  {
    message: 'tem funcao na coluna no where, year(Data) por exemplo, fica nao sargavel',
    expected: 'avoid_non_sargable_predicate',
  },
  {
    message: 'uso like % no inicio, wildcard prefix, curinga no inicio da string',
    expected: 'avoid_wildcard_prefix',
  },
  {
    message: 'essa tabela heap sem clustered com forwarding esta lenta',
    expected: 'avoid_heap_table',
  },
  {
    message: 'que indice ausente essa query precisa? tem sugestao de missing index',
    expected: 'recommend_missing_index',
  },
  {
    message: 'preciso criar um indice de cobertura com include pra cobrir a consulta',
    expected: 'create_assertive_index',
  },
  {
    message: 'tem stale statistics, precisa de update statistics e update da cardinalidade errada',
    expected: 'refresh_stale_statistics',
  },
  {
    message: 'o cursor processa linha a linha, queria algo set based em vez de while + update',
    expected: 'set_based_instead_of_cursor',
  },
  {
    message: 'preciso garantir a ordem dos resultados com top 1 e order by explicito',
    expected: 'always_use_order_by_for_guaranteed_order',
  },
  {
    message: 'a ordenacao na aplicacao torna o order by desnecessario',
    expected: 'avoid_unnecessary_order_by',
  },
  {
    message: 'uso @param is null or coluna = @param como filtro opcional, gera dynamic search',
    expected: 'avoid_dynamic_search_condition',
  },
  {
    message: 'tem funcao isnull na coluna no where, ISNULL(coluna, 0)',
    expected: 'avoid_isnull_in_where',
  },
  {
    message: 'a tabela temporaria #temp com grande volume de dados lota o tempdb',
    expected: 'avoid_large_temp_tables',
  },
  {
    message: 'a query faz varias leituras da mesma tabela varias vezes, agregacao multipla',
    expected: 'avoid_multiple_table_scans_with_case',
  },
  {
    message: 'usa not in com null e retorna resultados vazios',
    expected: 'avoid_not_in_with_nulls',
  },
  {
    message: 'tem exists com order by na subconsulta e row goal bias no plano',
    expected: 'avoid_row_goal_in_exists',
  },
  {
    message: 'estao fazendo update de fk na coluna de chave estrangeira sem necessidade',
    expected: 'avoid_unnecessary_foreign_key_updates',
  },
  {
    message: 'quero remover order by desnecessario da consulta de populacao',
    expected: 'avoid_unnecessary_order_by',
  },
  {
    message: 'a coluna varchar(max) com out-of-row causa lentidao',
    expected: 'avoid_varchar_max',
  },
  {
    message: 'o string_split repetido varias vezes deveria usar variavel de tabela para split',
    expected: 'cache_string_split_with_temp_table',
  },
  {
    message: 'a variavel de tabela é usada acima de 100 linhas, troco para tabela temporaria',
    expected: 'choose_temp_table_or_table_variable',
  },
  {
    message: 'multiplos update na mesma tabela podem virar um update com case',
    expected: 'consolidate_multiple_updates_with_case',
  },
  {
    message: 'o case com subquery usa a subquery como argumento no simple case',
    expected: 'encapsulate_case_with_correlated_subquery',
  },
  {
    message: 'a scalar udf lenta, preciso verificar o inlining e o is_inlineable',
    expected: 'ensure_scalar_udf_inlining',
  },
  {
    message: 'a subconsulta nao correlacionada executada repetidamente, posso extrair subconsulta',
    expected: 'extract_fixed_subquery_to_variable',
  },
  {
    message: 'a agregacao com null, sum com null na soma, precisa de isnull na expressao',
    expected: 'handle_nulls_in_aggregate_expressions',
  },
  {
    message: 'tem parameter sniffing com optimize for unknown e recompile',
    expected: 'handle_parameter_sniffing',
  },
  {
    message: 'a transacao longa causa bloqueios de longa duracao',
    expected: 'optimize_long_running_transaction',
  },
  {
    message: 'o case repetido no select e no where deveria usar cross apply',
    expected: 'optimize_repetitive_case_with_cross_apply',
  },
  {
    message: 'a concatenacao com for xml path deveria usar string_agg e stuff(',
    expected: 'prefer_string_agg_over_for_xml',
  },
  {
    message: 'usar union all em vez de union, union ao inves de union all',
    expected: 'prefer_union_all_over_union',
  },
  {
    message: 'o join com distinct força um sort caro, melhor exists',
    expected: 'replace_join_distinct_with_exists',
  },
  {
    message: 'o join apenas para filtrar gera duplicatas, usar exists no lugar de join',
    expected: 'replace_join_with_exists',
  },
  {
    message: 'left join is null é anti join, usar not exists para achar registros sem correspondencia',
    expected: 'replace_left_join_isnull_with_not_exists',
  },
  {
    message: 'o or entre colunas diferentes gera index scan por or, usar union all para or',
    expected: 'replace_or_between_columns_with_union_all',
  },
  {
    message: 'subconsulta correlacionada no where, reescrever como join pra evitar linha a linha',
    expected: 'replace_subselect_with_join',
  },
  {
    message: 'preciso de agregado por grupo com window function e partition by no select',
    expected: 'use_aggregate_over_partition',
  },
  {
    message: 'preciso calcular varios agregados com multiplas subconsultas e outer apply',
    expected: 'use_apply_for_multiple_aggregates',
  },
  {
    message: 'delete join e update join pra modificar com base em outra tabela',
    expected: 'use_join_in_delete_update',
  },
  {
    message: 'comparar com a linha anterior usando lag( em vez de self join',
    expected: 'use_lag_for_previous_row',
  },
  {
    message: 'a linha seguinte e o next row, usar lead( no lugar de self join',
    expected: 'use_lead_for_next_row',
  },
  {
    message: 'preciso capturar dados apos dml com scope_identity, usar output clause atomico',
    expected: 'use_output_clause_for_atomic_operations',
  },
  {
    message: 'ranquear linhas com row_number() e dense_rank() em vez de numeracao manual',
    expected: 'use_rank_functions_for_numbering',
  },
  {
    message: 'acho a linha mais recente de cada grupo com row_number partition by group',
    expected: 'use_row_number_for_top_n_per_group',
  },
  {
    message: 'calculo o running total com sum() over e total acumulado',
    expected: 'use_sum_over_for_running_total',
  },
  {
    message: 'a media movel com moving average usa rows between numa janela deslizante',
    expected: 'use_window_functions_for_sliding_window',
  },
];

test('SkillMatcher roteia mensagens auto para as 48 skills fixas', () => {
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository: new InMemoryRepository(), registry });
  loader.loadFixed();
  const matcher = new SkillMatcher({ skillRegistry: registry });

  for (const { message, expected } of ROUTING_CASES) {
    const matched = matcher.match(message);
    assert.ok(matched, `a mensagem "${message}" deveria corresponder a uma skill`);
    assert.equal(
      matched.name,
      expected,
      `a mensagem "${message}" deveria rotear para ${expected}, mas roteou para ${matched.name}`,
    );
  }
});

test('SkillMatcher retorna null para mensagem sem correspondência', () => {
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository: new InMemoryRepository(), registry });
  loader.loadFixed();
  const matcher = new SkillMatcher({ skillRegistry: registry });
  assert.equal(matcher.match('o banco está lento de forma geral'), null);
});