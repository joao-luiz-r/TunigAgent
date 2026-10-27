import { createGetExecutionPlanTool } from './get-execution-plan.tool.js';
import { createGetTableIndexesTool } from './get-table-indexes.tool.js';
import { createGetTableSchemaTool } from './get-table-schema.tool.js';
import { createGetQueryTextTool } from './get-query-text.tool.js';
import { createGetWaitStatsTool } from './get-wait-stats.tool.js';
import { createGetTableStatisticsTool } from './get-table-statistics.tool.js';
import { createGetForeignKeysTool } from './get-foreign-keys.tool.js';
import { createGetObjectMetadataTool } from './get-object-metadata.tool.js';
import { createGetSkillDetailsTool } from './get-skill-details.tool.js';

export function registerAllTools(registry, { skillRegistry } = {}) {
  const tools = [
    createGetExecutionPlanTool(),
    createGetTableIndexesTool(),
    createGetTableSchemaTool(),
    createGetQueryTextTool(),
    createGetWaitStatsTool(),
    createGetTableStatisticsTool(),
    createGetForeignKeysTool(),
    createGetObjectMetadataTool(),
    // Interna do harness (resolvida sem pedir dados ao usuário). Por último
    // para não alterar a ordem das tools de coleta.
    createGetSkillDetailsTool({
      getSkill: (name) => (skillRegistry ? skillRegistry.get(name) : null),
    }),
  ];
  tools.forEach((tool) => registry.register(tool));
}
