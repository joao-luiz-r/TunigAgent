import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetExecutionPlanTool() {
  return new CollectTool({
    name: 'get_execution_plan',
    description:
      'Gera um script T-SQL que captura o plano de execução (SHOWPLAN_XML) de uma consulta para análise de operadores, scans, lookups e custos.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Nome do banco de dados de destino.' },
        queryText: { type: 'string', description: 'Texto da consulta a ser analisada.' },
      },
      required: ['database'],
    },
    buildScript({ database, queryText }) {
      const db = safeIdentifier(database, 'SeuBanco');
      const query = queryText ? queryText.trim() : '-- Cole aqui o texto da consulta';
      return [
        `USE [${db}];`,
        'GO',
        'SET SHOWPLAN_XML ON;',
        'GO',
        query,
        'GO',
        'SET SHOWPLAN_XML OFF;',
        'GO',
      ].join('\n');
    },
  });
}
