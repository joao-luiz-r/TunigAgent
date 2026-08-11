import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetTableSchemaTool() {
  return new CollectTool({
    name: 'get_table_schema',
    description:
      'Gera um script T-SQL que retorna o schema de uma tabela: colunas, tipos, nulabilidade e índices existentes.',
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
        '  TABLE_SCHEMA,',
        '  TABLE_NAME,',
        '  COLUMN_NAME,',
        '  ORDINAL_POSITION,',
        '  DATA_TYPE,',
        '  CHARACTER_MAXIMUM_LENGTH,',
        '  IS_NULLABLE',
        'FROM INFORMATION_SCHEMA.COLUMNS',
        `WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}'`,
        'ORDER BY ORDINAL_POSITION;',
        'GO',
        'SELECT',
        '  i.name AS indice,',
        '  i.type_desc AS tipo,',
        '  c.name AS coluna,',
        '  ic.key_ordinal AS ordem_chave,',
        '  ic.is_included_column AS coluna_incluida',
        `FROM sys.indexes AS i`,
        `INNER JOIN sys.index_columns AS ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id`,
        `INNER JOIN sys.columns AS c ON ic.object_id = c.object_id AND ic.column_id = c.column_id`,
        `WHERE i.object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        'ORDER BY i.index_id, ic.key_ordinal;',
        'GO',
      ].join('\n');
    },
  });
}
