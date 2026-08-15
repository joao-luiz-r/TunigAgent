import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

export function createGetObjectMetadataTool() {
  return new CollectTool({
    name: 'get_object_metadata',
    description:
      'Gera um script T-SQL que retorna metadados de um objeto (função escalar, iTVF, procedimento): tipo, definição, is_inlineable, is_schema_bound e flags de compatibilidade (sys.sql_modules + sys.objects). Usado para verificar se uma Scalar UDF pode ser inlineada.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Nome do banco de dados de destino.' },
        schema: { type: 'string', description: 'Schema do objeto (padrão dbo).' },
        object: { type: 'string', description: 'Nome do objeto (função, proc, view).' },
      },
      required: ['database', 'object'],
    },
    buildScript({ database, schema, object }) {
      const db = safeIdentifier(database, 'SeuBanco');
      const schemaName = safeIdentifier(schema || 'dbo', 'dbo');
      const objectName = safeIdentifier(object, 'MinhaFuncao');
      return [
        `USE [${db}];`,
        'GO',
        'SELECT',
        '  OBJECT_SCHEMA_NAME(m.object_id) AS schema_nome,',
        '  OBJECT_NAME(m.object_id) AS objeto,',
        '  o.type_desc AS tipo,',
        '  m.is_inlineable AS inlineavel,',
        '  m.is_schema_bound AS schemabound,',
        '  ISNULL(m.uses_ansi_nulls, 0) AS usa_ansi_nulls,',
        '  ISNULL(m.uses_quoted_identifier, 0) AS usa_quoted_identifier,',
        '  m.definition',
        'FROM sys.sql_modules AS m',
        'INNER JOIN sys.objects AS o ON m.object_id = o.object_id',
        `WHERE o.name = '${objectName}'`,
        `  AND schema_id(OBJECT_SCHEMA_NAME(m.object_id)) = SCHEMA_ID('${schemaName}')`,
        ';',
        'GO',
      ].join('\n');
    },
  });
}