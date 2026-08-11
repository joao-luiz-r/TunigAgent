import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPendingMigrations, migrations } from '../src/application/migrations/migration-registry.js';
import { MigrationService } from '../src/application/migrations/migration-service.js';
import { ContextManager } from '../src/infra/llm/context-manager.js';
import { CacheManager } from '../src/infra/cache/cache-manager.js';
import { SessionCache } from '../src/infra/cache/session-cache.js';
import { InMemoryRepository } from './helpers.js';

test('migrações estão ordenadas por versão', () => {
  const versions = migrations.map((m) => m.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
});

test('getPendingMigrations retorna as não aplicadas em ordem', () => {
  const pending = getPendingMigrations([1]);
  assert.deepEqual(
    pending.map((m) => m.version),
    [2],
  );
  assert.deepEqual(getPendingMigrations([]).map((m) => m.version), [1, 2]);
  assert.deepEqual(getPendingMigrations([1, 2]), []);
});

test('MigrationService aplica migrações pendentes e registra', async () => {
  const applied = [];
  const db = {
    collection(name) {
      return {
        createIndex: async () => null,
        updateMany: async () => null,
        find: async () => ({ toArray: async () => [] }),
      };
    },
  };
  const repository = {
    ensureIndexes: async () => null,
    getAppliedVersions: async () => [],
    record: async (entry) => applied.push(entry.version),
  };
  const service = new MigrationService({ db, repository });
  const count = await service.run();
  assert.equal(count, 2);
  assert.deepEqual(applied, [1, 2]);
});

test('ContextManager conta tokens aproximados e trim mantém mensagens recentes', () => {
  const manager = new ContextManager({ maxTokens: 100 });
  const messages = [];
  for (let i = 0; i < 20; i += 1) {
    messages.push({ role: 'user', content: `mensagem numero ${i} com algum conteúdo` });
  }
  const trimmed = manager.trim(messages);
  assert.ok(manager.countTokens(trimmed) <= 100);
  assert.equal(trimmed[trimmed.length - 1], messages[messages.length - 1]);
});

test('ContextManager preserva a primeira mensagem do usuário e remove pares assistant/tool sem deixar órfãos', () => {
  const manager = new ContextManager({ maxTokens: 100 });
  const messages = [
    { role: 'user', content: 'x'.repeat(400) },
    { role: 'assistant', content: null, tool_calls: [{ id: 'a', function: { name: 't', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'a', content: 'resultado' },
    { role: 'user', content: 'continua' },
  ];
  const trimmed = manager.trim(messages);
  assert.equal(trimmed[0], messages[0]);
  assert.equal(trimmed.some((m) => m.role === 'tool'), false, 'tool sem assistant correspondente deve ser removido');
  assert.equal(trimmed.some((m) => m.tool_calls && !trimmed.find((x) => x.tool_call_id === m.tool_calls[0].id)), false);
});

test('CacheManager consulta sessão antes do repositório persistente', async () => {
  const sessionCache = new SessionCache();
  const factRepository = new InMemoryRepository();
  const manager = new CacheManager({ sessionCache, factRepository });

  const session = { sessionId: 's1', facts: new Map() };
  sessionCache.save(session);

  await manager.storeFact('s1', 'get_query_text', 'hash1', { rows: [{ a: 1 }] });
  const resolved = await manager.resolveFact('s1', 'get_query_text', 'hash1');
  assert.deepEqual(resolved, { rows: [{ a: 1 }] });
  assert.equal(factRepository.documents.length, 1);

  const fromRepo = await manager.resolveFact('s2', 'get_query_text', 'hash1');
  assert.deepEqual(fromRepo, { rows: [{ a: 1 }] });
});

test('CacheManager.resolveFact retorna null para chave inexistente', async () => {
  const sessionCache = new SessionCache();
  const factRepository = new InMemoryRepository();
  const manager = new CacheManager({ sessionCache, factRepository });
  assert.equal(await manager.resolveFact('s1', 'get_wait_stats', 'hash-x'), null);
});
