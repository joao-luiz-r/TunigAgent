import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetTableStatisticsTool() {
  return new CollectTool({
    name: 'get_table_statistics',
    description:
      'Gera um script T-SQL que retorna os metadados das estatísticas de uma tabela: nome, data da última atualização, linhas, linhas amostradas e contador de modificações (sys.stats + sys.dm_db_stats_properties).',
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
        '  s.name AS estatistica,',
        '  OBJECT_SCHEMA_NAME(s.object_id) AS schema_nome,',
        '  OBJECT_NAME(s.object_id) AS tabela,',
        '  s.auto_created AS auto_criada,',
        '  s.user_created AS criada_usuario,',
        '  st.last_updated AS ultima_atualizacao,',
        '  st.rows AS linhas,',
        '  st.rows_sampled AS linhas_amostradas,',
        '  st.modification_counter AS modificacoes,',
        '  st.steps AS passos_histograma',
        'FROM sys.stats AS s',
        'CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) AS st',
        `WHERE s.object_id = OBJECT_ID('${schemaName}.${tableName}')`,
        'ORDER BY s.name;',
        'GO',
      ].join('\n');
    },
  });
}