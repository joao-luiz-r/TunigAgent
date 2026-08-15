import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAllTools } from '../src/application/tools/register-tools.js';
import { ToolRegistry } from '../src/application/tools/tool-registry.js';
import { parseTabularResult } from '../src/application/tools/parsers/table-result-parser.js';
import { safeIdentifier } from '../src/application/tools/parsers/sql-helpers.js';

const EXPECTED_TOOLS = [
  'get_execution_plan',
  'get_table_indexes',
  'get_table_schema',
  'get_query_text',
  'get_wait_stats',
  'get_table_statistics',
  'get_foreign_keys',
  'get_object_metadata',
];

function buildRegistry() {
  const registry = new ToolRegistry();
  registerAllTools(registry);
  return registry;
}

test('registra todas as tools de coleta do mínimo viável', () => {
  const registry = buildRegistry();
  EXPECTED_TOOLS.forEach((name) => assert.ok(registry.has(name), `tool ${name} deveria estar registrada`));
  assert.equal(registry.all().length, EXPECTED_TOOLS.length);
});

test('definitions retorna apenas as tools solicitadas', () => {
  const registry = buildRegistry();
  const defs = registry.definitions(['get_execution_plan', 'get_table_schema']);
  assert.equal(defs.length, 2);
  assert.deepEqual(
    defs.map((d) => d.function.name),
    ['get_execution_plan', 'get_table_schema'],
  );
});

test('get_execution_plan gera script SHOWPLAN_XML com a query fornecida', () => {
  const registry = buildRegistry();
  const script = registry.get('get_execution_plan').buildScript({
    database: 'MeuBanco',
    queryText: 'SELECT * FROM dbo.Pedidos',
  });
  assert.match(script, /USE \[MeuBanco\]/);
  assert.match(script, /SET SHOWPLAN_XML ON/);
  assert.match(script, /SELECT \* FROM dbo\.Pedidos/);
});

test('get_execution_plan sanitiza identificadores do banco', () => {
  const registry = buildRegistry();
  const script = registry.get('get_execution_plan').buildScript({ database: 'Meu Banco; DROP TABLE x' });
  assert.ok(!script.includes('DROP TABLE x'));
  assert.match(script, /USE \[MeuBancoDROPTABLEx\]/);
});

test('get_query_text gera script com filtro opcional de query_hash', () => {
  const registry = buildRegistry();
  const script = registry.get('get_query_text').buildScript({ database: 'DB', queryHash: '0x123456' });
  assert.match(script, /query_hash = CONVERT\(binary\(8\), 0123456\)/);
  const plain = registry.get('get_query_text').buildScript({ database: 'DB' });
  assert.ok(!plain.includes('query_hash ='));
  assert.match(plain, /FETCH NEXT 10 ROWS ONLY/);
});

test('get_table_schema gera script com schema e tabela', () => {
  const registry = buildRegistry();
  const script = registry.get('get_table_schema').buildScript({
    database: 'DB',
    schema: 'dbo',
    table: 'Clientes',
  });
  assert.match(script, /OBJECT_ID\('dbo\.Clientes'\)/);
  assert.match(script, /TABLE_NAME = 'Clientes'/);
});

test('get_table_indexes gera script com índices existentes, colunas e opções', () => {
  const registry = buildRegistry();
  const script = registry.get('get_table_indexes').buildScript({
    database: 'DB',
    schema: 'dbo',
    table: 'Clientes',
  });
  assert.match(script, /OBJECT_ID\('dbo\.Clientes'\)/);
  assert.match(script, /i\.name AS indice/);
  assert.match(script, /i\.fill_factor AS fillfactor/);
  assert.match(script, /p\.data_compression_desc AS compressao/);
  assert.match(script, /ic\.is_included_column AS coluna_incluida/);
});

test('get_wait_stats exclui wait types irrelevantes e respeita TOP', () => {
  const registry = buildRegistry();
  const script = registry.get('get_wait_stats').buildScript({ database: 'DB', topN: 5 });
  assert.match(script, /USE \[DB\]/);
  assert.match(script, /WHERE wait_type NOT IN \('SLEEP_TASK'/);
  assert.ok(script.includes('ORDER BY wait_time_ms DESC;'));
});

test('get_table_statistics gera script com sys.dm_db_stats_properties', () => {
  const registry = buildRegistry();
  const script = registry.get('get_table_statistics').buildScript({
    database: 'DB',
    schema: 'dbo',
    table: 'Pedidos',
  });
  assert.match(script, /USE \[DB\]/);
  assert.match(script, /FROM sys\.stats AS s/);
  assert.match(script, /dm_db_stats_properties/);
  assert.match(script, /OBJECT_ID\('dbo\.Pedidos'\)/);
  assert.match(script, /st\.modification_counter AS modificacoes/);
});

test('get_foreign_keys gera script com mapeamento filho<->pai', () => {
  const registry = buildRegistry();
  const script = registry.get('get_foreign_keys').buildScript({
    database: 'DB',
    schema: 'dbo',
    table: 'Pedidos',
  });
  assert.match(script, /FROM sys\.foreign_keys AS fk/);
  assert.match(script, /sys\.foreign_key_columns/);
  assert.match(script, /coluna_filha/);
  assert.match(script, /coluna_pai/);
  assert.match(script, /OBJECT_ID\('dbo\.Pedidos'\)/);
});

test('get_object_metadata gera script com is_inlineable', () => {
  const registry = buildRegistry();
  const script = registry.get('get_object_metadata').buildScript({
    database: 'DB',
    schema: 'dbo',
    object: 'CalculaDesconto',
  });
  assert.match(script, /FROM sys\.sql_modules AS m/);
  assert.match(script, /m\.is_inlineable AS inlineavel/);
  assert.match(script, /o\.name = 'CalculaDesconto'/);
});

test('parseTabularResult parseia tabela delimitada por |', () => {
  const raw = [
    'coluna1 | coluna2',
    '--------|--------',
    'a       | b',
    'c       | d',
  ].join('\n');
  const parsed = parseTabularResult(raw);
  assert.ok(parsed);
  assert.deepEqual(parsed.columns, ['coluna1', 'coluna2']);
  assert.deepEqual(parsed.rows[0], { coluna1: 'a', coluna2: 'b' });
  assert.deepEqual(parsed.rows[1], { coluna1: 'c', coluna2: 'd' });
});

test('parseTabularResult parseia tabela com múltiplos espaços', () => {
  const raw = ['nome   valor', 'joao   10', 'maria  20'].join('\n');
  const parsed = parseTabularResult(raw);
  assert.ok(parsed);
  assert.equal(parsed.rows[0].nome, 'joao');
  assert.equal(parsed.rows[0].valor, '10');
});

test('parseTabularResult deduplica colunas repetidas', () => {
  const raw = ['id   id   valor', '1    2    3'].join('\n');
  const parsed = parseTabularResult(raw);
  assert.deepEqual(parsed.columns, ['id', 'id_2', 'valor']);
});

test('parseTabularResult retorna null para conteúdo inválido', () => {
  assert.equal(parseTabularResult(''), null);
  assert.equal(parseTabularResult('linha única'), null);
  assert.equal(parseTabularResult(12345), null);
});

test('parseResult de CollectTool devolve tabular ou raw', () => {
  const registry = buildRegistry();
  const tool = registry.get('get_query_text');
  const tabular = tool.parseResult('a | b\n--|--\n1 | 2\n');
  assert.ok(tabular.rows);
  const raw = tool.parseResult('texto livre sem tabela');
  assert.equal(raw.raw, 'texto livre sem tabela');
});

test('computeKey é estável independente da ordem dos parâmetros', () => {
  const registry = buildRegistry();
  const tool = registry.get('get_table_schema');
  const keyA = tool.computeKey({ database: 'DB', table: 'T' });
  const keyB = tool.computeKey({ table: 'T', database: 'DB' });
  assert.equal(keyA, keyB);
  assert.notEqual(keyA, tool.computeKey({ database: 'DB', table: 'X' }));
});

test('safeIdentifier remove caracteres perigosos e aplica fallback', () => {
  assert.equal(safeIdentifier('dbo.Clientes', 'fallback'), 'dboClientes');
  assert.equal(safeIdentifier('', 'fallback'), 'fallback');
  assert.equal(safeIdentifier(null, 'fallback'), 'fallback');
});
