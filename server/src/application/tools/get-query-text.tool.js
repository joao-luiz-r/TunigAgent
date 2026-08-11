import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetQueryTextTool() {
  return new CollectTool({
    name: 'get_query_text',
    description:
      'Gera um script T-SQL que recupera o texto e estatísticas de execução de consultas recentes via sys.dm_exec_query_stats.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Nome do banco de dados de destino.' },
        queryHash: { type: 'string', description: 'query_hash da consulta (opcional).' },
      },
      required: ['database'],
    },
    buildScript({ database, queryHash }) {
      const db = safeIdentifier(database, 'SeuBanco');
      const hashFilter = queryHash
        ? `WHERE qs.query_hash = CONVERT(binary(8), ${String(queryHash).replace(/[^0-9]/g, '')})`
        : '';
      const paging = queryHash ? '' : 'ORDER BY qs.last_execution_time DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY;';
      return [
        `USE [${db}];`,
        'GO',
        'SELECT',
        '  qs.execution_count AS execucoes,',
        '  qs.last_execution_time AS ultima_execucao,',
        '  qs.total_elapsed_time / 1000 AS tempo_total_ms,',
        '  qs.total_logical_reads AS leituras_logicas,',
        '  SUBSTRING(st.text, (qs.statement_start_offset / 2) + 1,',
        '    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE qs.statement_end_offset END',
        '      - qs.statement_start_offset) / 2) + 1) AS texto_consulta',
        'FROM sys.dm_exec_query_stats AS qs',
        'CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st',
        hashFilter,
        paging,
        'GO',
      ]
        .filter((line) => line !== '')
        .join('\n');
    },
  });
}
