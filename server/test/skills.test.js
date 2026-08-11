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
    'avoid_heap_table',
    'avoid_non_sargable_predicate',
    'avoid_select_star',
    'avoid_wildcard_prefix',
    'create_assertive_index',
    'detect_implicit_conversion',
    'ensure_fk_indexes',
    'general_tuning',
    'key_lookup_elimination',
    'recommend_missing_index',
    'refresh_stale_statistics',
    'set_based_instead_of_cursor',
    'skill_factory',
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
