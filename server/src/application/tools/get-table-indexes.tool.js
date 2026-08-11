import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetTableIndexesTool() {
  return new CollectTool({
    name: 'get_table_indexes',
    description:
      'Gera um script T-SQL que lista todos os índices existentes de uma tabela: nome, tipo (clustered/nonclustered), colunas-chave, colunas INCLUDE, filtro, unicidade, fillfactor, pad_index, compressão de página e suporte a ONLINE. Use antes de sugerir a criação de índices para evitar redundância.',
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
        '  i.index_id,',
        '  i.name AS indice,',
        '  i.type_desc AS tipo,',
        '  i.is_unique AS unico,',
        '  i.is_primary_key AS eh_pk,',
        '  i.has_filter AS tem_filtro,',
        '  i.filter_definition AS filtro,',
        '  i.fill_factor AS fillfactor,',
        '  i.is_padded AS pad_index,',
        '  i.allow_page_locks,',
        '  p.data_compression_desc AS compressao',
        'FROM sys.indexes AS i',
        'INNER JOIN sys.partitions AS p ON i.object_id = p.object_id AND i.index_id = p.index_id',
        `WHERE i.object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        'GROUP BY i.index_id, i.name, i.type_desc, i.is_unique, i.is_primary_key, i.has_filter, i.filter_definition, i.fill_factor, i.is_padded, i.allow_page_locks, p.data_compression_desc',
        'ORDER BY i.index_id;',
        'GO',
        'SELECT',
        '  i.name AS indice,',
        '  c.name AS coluna,',
        '  ic.key_ordinal AS ordem_chave,',
        '  ic.is_included_column AS coluna_incluida',
        'FROM sys.indexes AS i',
        'INNER JOIN sys.index_columns AS ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id',
        'INNER JOIN sys.columns AS c ON ic.object_id = c.object_id AND ic.column_id = c.column_id',
        `WHERE i.object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        'ORDER BY i.index_id, ic.is_included_column, ic.key_ordinal;',
        'GO',
      ].join('\n');
    },
  });
}
