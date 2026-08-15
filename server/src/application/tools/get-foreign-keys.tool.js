import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetForeignKeysTool() {
  return new CollectTool({
    name: 'get_foreign_keys',
    description:
      'Gera um script T-SQL que lista as chaves estrangeiras (FOREIGN KEY) que envolvem uma tabela: nome da FK, tabela filha, tabela pai e o mapeamento coluna filha <-> coluna pai (sys.foreign_keys). Identifica quais colunas participam de FKs.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Nome do banco de dados de destino.' },
        schema: { type: 'string', description: 'Schema da tabela (padrão dbo).' },
        table: { type: 'string', description: 'Nome da tabela.' },
      },
      required: ['database', 'table'],
    },
    buildScript({ database, schema, table }) {
      const db = safeIdentifier(database, 'SeuBanco');
      const schemaName = safeIdentifier(schema || 'dbo', 'dbo');
      const tableName = safeIdentifier(table, 'MinhaTabela');
      return [
        `USE [${db}];`,
        'GO',
        'SELECT',
        '  fk.name AS fk,',
        '  OBJECT_SCHEMA_NAME(fk.parent_object_id) AS schema_filho,',
        '  OBJECT_NAME(fk.parent_object_id) AS tabela_filha,',
        '  OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS schema_pai,',
        '  OBJECT_NAME(fk.referenced_object_id) AS tabela_pai,',
        '  c.name AS coluna_filha,',
        '  rc.name AS coluna_pai,',
        '  fkc.constraint_column_id AS ordem_coluna',
        'FROM sys.foreign_keys AS fk',
        'INNER JOIN sys.foreign_key_columns AS fkc',
        '  ON fk.object_id = fkc.constraint_object_id',
        'INNER JOIN sys.columns AS c',
        '  ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id',
        'INNER JOIN sys.columns AS rc',
        '  ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id',
        `WHERE fk.parent_object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        `   OR fk.referenced_object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        'ORDER BY fk.name, fkc.constraint_column_id;',
        'GO',
      ].join('\n');
    },
  });
}