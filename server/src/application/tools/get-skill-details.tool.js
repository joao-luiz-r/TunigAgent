import { createHash } from 'node:crypto';

export const SKILL_DETAILS_TOOL_NAME = 'get_skill_details';

/**
 * Tool interna (resolvida pelo harness sem pedir dados ao usuário):
 * carrega o manual completo de 1..N skills a partir do catálogo compacto.
 */
export function createGetSkillDetailsTool({ getSkill } = {}) {
  const resolve = typeof getSkill === 'function' ? getSkill : () => null;
  return {
    name: SKILL_DETAILS_TOOL_NAME,
    getDefinition() {
      return {
        type: 'function',
        function: {
          name: SKILL_DETAILS_TOOL_NAME,
          description:
            'Carrega o manual completo (instruções, padrão ANTES/DEPOIS e recomendação) das skills cujos cabeçalhos no catálogo correspondem aos patterns encontrados no código. Use quando identificar 1 ou mais skills aplicáveis, inclusive em conjunto.',
          parameters: {
            type: 'object',
            properties: {
              skills: {
                type: 'array',
                items: { type: 'string' },
                description: 'Nomes das skills a carregar (ex: ["avoid_select_star", "avoid_wildcard_prefix"]).',
              },
            },
            required: ['skills'],
          },
        },
      };
    },
    computeKey(params) {
      const names = normalizeNames(params)
        .map((name) => name.toLowerCase())
        .sort();
      return createHash('sha256').update(JSON.stringify(names)).digest('hex');
    },
    resolve(names) {
      return normalizeNames({ skills: names })
        .map((name) => resolve(name))
        .filter(Boolean);
    },
  };
}

export function normalizeNames(params) {
  if (!params) return [];
  if (Array.isArray(params)) return params.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
  const raw = params.skills ?? params.names ?? params.skill ?? params.name ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
}
