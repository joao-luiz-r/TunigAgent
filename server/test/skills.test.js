import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry } from '../src/application/skills/skill-registry.js';
import { SkillLoader } from '../src/application/skills/skill-loader.js';
import { Skill } from '../src/domain/entities/skill.js';
import { InMemoryRepository } from './helpers.js';

test('loadFixed registra todas as skills fixas + skill factory', () => {
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository: new InMemoryRepository(), registry });
  loader.loadFixed();
  const names = registry.list().map((skill) => skill.name).sort();
  assert.deepEqual(names, [
    'always_use_order_by_for_guaranteed_order',
    'avoid_dynamic_search_condition',
    'avoid_heap_table',
    'avoid_isnull_in_where',
    'avoid_large_temp_tables',
    'avoid_multiple_table_scans_with_case',
    'avoid_non_sargable_predicate',
    'avoid_not_in_with_nulls',
    'avoid_row_goal_in_exists',
    'avoid_select_star',
    'avoid_unnecessary_foreign_key_updates',
    'avoid_unnecessary_order_by',
    'avoid_varchar_max',
    'avoid_wildcard_prefix',
    'cache_string_split_with_temp_table',
    'choose_temp_table_or_table_variable',
    'consolidate_multiple_updates_with_case',
    'create_assertive_index',
    'detect_implicit_conversion',
    'encapsulate_case_with_correlated_subquery',
    'ensure_fk_indexes',
    'ensure_scalar_udf_inlining',
    'extract_fixed_subquery_to_variable',
    'general_tuning',
    'handle_nulls_in_aggregate_expressions',
    'handle_parameter_sniffing',
    'key_lookup_elimination',
    'optimize_long_running_transaction',
    'optimize_repetitive_case_with_cross_apply',
    'prefer_string_agg_over_for_xml',
    'prefer_union_all_over_union',
    'recommend_missing_index',
    'refresh_stale_statistics',
    'replace_join_distinct_with_exists',
    'replace_join_with_exists',
    'replace_left_join_isnull_with_not_exists',
    'replace_or_between_columns_with_union_all',
    'replace_subselect_with_join',
    'set_based_instead_of_cursor',
    'skill_factory',
    'use_aggregate_over_partition',
    'use_apply_for_multiple_aggregates',
    'use_join_in_delete_update',
    'use_lag_for_previous_row',
    'use_lead_for_next_row',
    'use_output_clause_for_atomic_operations',
    'use_rank_functions_for_numbering',
    'use_row_number_for_top_n_per_group',
    'use_sum_over_for_running_total',
    'use_window_functions_for_sliding_window',
  ]);
});

test('loadDynamic registra skills persistidas que estão habilitadas', async () => {
  const repository = new InMemoryRepository();
  await repository.save({
    name: 'skill_dinamica',
    description: 'desc',
    systemPrompt: 'prompt',
    toolsRequired: ['get_execution_plan'],
    source: 'factory',
    enabled: true,
    version: 2,
  });
  await repository.save({
    name: 'skill_desativada',
    description: 'desc',
    systemPrompt: 'prompt',
    toolsRequired: [],
    source: 'factory',
    enabled: false,
    version: 2,
  });

  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository, registry });
  await loader.loadDynamic();

  assert.ok(registry.get('skill_dinamica'));
  assert.equal(registry.get('skill_desativada'), null);
});

test('registerDynamic persiste e registra no registry', async () => {
  const repository = new InMemoryRepository();
  const registry = new SkillRegistry();
  const loader = new SkillLoader({ repository, registry });

  const skill = new Skill({
    name: 'nova',
    description: 'desc',
    systemPrompt: 'prompt',
    toolsRequired: [],
    source: 'factory',
  });
  await loader.registerDynamic(skill);

  assert.ok(registry.get('nova'));
  assert.equal(repository.documents.length, 1);
  assert.equal(repository.documents[0].name, 'nova');
  assert.equal(repository.documents[0].source, 'factory');
});

test('toMetadata expõe apenas campos públicos', () => {
  const skill = new Skill({
    name: 'x',
    description: 'd',
    systemPrompt: 'p',
    toolsRequired: [],
    source: 'fixed',
  });
  assert.deepEqual(Object.keys(skill.toMetadata()).sort(), ['description', 'enabled', 'isFactory', 'name', 'source']);
});
