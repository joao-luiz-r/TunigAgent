import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSql, extractDatabaseAndTable } from '../src/application/analyzers/sql-analyzer.js';

test('analyzeSql identifica SELECT * como ALTO', () => {
  const findings = analyzeSql('SELECT * FROM Pedidos WHERE Status = 1');
  const star = findings.find((f) => f.title === 'Uso de SELECT *');
  assert.ok(star, 'deveria haver finding de SELECT *');
  assert.equal(star.severity, 'ALTO');
  assert.match(star.suggestion, /apenas as colunas realmente necess[áa]rias/i);
});

test('analyzeSql sinaliza ausência de WHERE em SELECT', () => {
  const findings = analyzeSql('SELECT Id FROM Clientes');
  const noWhere = findings.find((f) => f.title === 'Predicado WHERE ausente');
  assert.ok(noWhere);
  assert.equal(noWhere.severity, 'ALTO');
});

test('analyzeSql sinaliza ausência de WHERE em DELETE e UPDATE', () => {
  assert.ok(analyzeSql('DELETE FROM T').some((f) => f.title === 'Predicado WHERE ausente'));
  assert.ok(analyzeSql('UPDATE T SET a = 1').some((f) => f.title === 'Predicado WHERE ausente'));
});

test('analyzeSql detecta aritmética sobre coluna no WHERE', () => {
  const findings = analyzeSql('SELECT * FROM T WHERE total / 2 > 30');
  const arithmetic = findings.find((f) => f.title === 'Aritmética sobre a coluna total');
  assert.ok(arithmetic);
  assert.equal(arithmetic.severity, 'CRITICO');
  assert.match(arithmetic.detail, /total/);
});

test('analyzeSql detecta função sobre coluna no WHERE (YEAR, ISNULL, conversão)', () => {
  assert.equal(
    analyzeSql('SELECT * FROM T WHERE YEAR(Data) = 2024').find((f) => /^Função aplicada/.test(f.title)).severity,
    'CRITICO',
  );
  assert.ok(analyzeSql('SELECT * FROM T WHERE ISNULL(coluna, 0) > 1').some((f) => /^Função aplicada/.test(f.title)));
  assert.ok(analyzeSql('SELECT * FROM T WHERE CONVERT(int, coluna) = 1').some((f) => /^Função aplicada/.test(f.title)));
});

test('analyzeSql detecta LIKE com curinga inicial', () => {
  const findings = analyzeSql("SELECT * FROM T WHERE nome LIKE '%abc%'");
  const wildcard = findings.find((f) => f.title === 'LIKE com curinga inicial na coluna nome');
  assert.ok(wildcard);
  assert.equal(wildcard.severity, 'MEDIO');
});

test('analyzeSql detecta TOP sem ORDER BY', () => {
  const findings = analyzeSql('SELECT TOP 10 * FROM T');
  const top = findings.find((f) => f.title === 'TOP sem ORDER BY');
  assert.ok(top);
  assert.equal(top.severity, 'MEDIO');
});

test('analyzeSql NÃO flagra TOP com ORDER BY presente', () => {
  const findings = analyzeSql('SELECT TOP 5 Coluna FROM T ORDER BY Data DESC');
  assert.ok(!findings.some((f) => f.title === 'TOP sem ORDER BY'));
});

test('analyzeSql retorna INFO quando nenhum padrão é encontrado', () => {
  const findings = analyzeSql('SELECT Id FROM Clientes WHERE Id > 10');
  const info = findings.find((f) => f.title === 'Nenhum problema óbvio identificado na análise estática');
  assert.ok(info);
  assert.equal(info.severity, 'INFO');
});

test('analyzeSql agrupa múltiplos achados independentes', () => {
  const findings = analyzeSql("SELECT * FROM T WHERE nome LIKE '%abc%'");
  assert.ok(findings.some((f) => f.title === 'Uso de SELECT *'));
  assert.ok(findings.some((f) => f.title === 'LIKE com curinga inicial na coluna nome'));
});

test('analyzeSql trata entrada vazia ou não-string sem lançar', () => {
  assert.ok(analyzeSql('').length > 0);
  assert.doesNotThrow(() => analyzeSql(null));
  assert.doesNotThrow(() => analyzeSql(undefined));
  assert.doesNotThrow(() => analyzeSql(12345));
});

test('extractDatabaseAndTable extrai tabela de FROM com alias', () => {
  const { database, table } = extractDatabaseAndTable('SELECT * FROM dbo.Pedidos p');
  assert.equal(database, null);
  assert.equal(table, 'Pedidos');
});

test('extractDatabaseAndTable extrai database e tabela de nome composto', () => {
  const { database, table } = extractDatabaseAndTable('SELECT * FROM MeuBanco.dbo.Pedidos');
  assert.equal(database, 'MeuBanco');
  assert.equal(table, 'Pedidos');
});

test('extractDatabaseAndTable lida com colchetes', () => {
  const { database, table } = extractDatabaseAndTable('SELECT * FROM [MeuBanco].[dbo].[Pedidos]');
  assert.equal(database, 'MeuBanco');
  assert.equal(table, 'Pedidos');
});

test('extractDatabaseAndTable retorna null quando não há FROM', () => {
  const { database, table } = extractDatabaseAndTable('SELECT GETDATE()');
  assert.equal(database, null);
  assert.equal(table, null);
});

test('extractDatabaseAndTable não confunde subconsulta como primeira tabela', () => {
  const { database, table } = extractDatabaseAndTable(
    'SELECT * FROM dbo.Pedidos p INNER JOIN dbo.Clientes c ON p.Id = c.Id',
  );
  assert.equal(database, null);
  assert.equal(table, 'Pedidos');
});