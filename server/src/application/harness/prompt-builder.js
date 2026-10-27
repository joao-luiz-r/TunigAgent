import { AGENT_PERSONA } from '../agent/persona.js';
import { buildCompactSkillCatalog, buildFullSkillDetails } from '../skills/skill-catalog.js';
import { HARNESS_DEFINITION } from './harness-definition.js';

export const USER_DATA_OPEN = '[[DADOS_DO_USUARIO_INICIO]]';
export const USER_DATA_CLOSE = '[[DADOS_DO_USUARIO_FIM]]';

const SKILL_DEMAND_GUIDANCE = [
  '## Skills sob demanda (sem skill ativa única)',
  '',
  '- O catálogo acima traz apenas cabeçalhos (nome + quando usar). Qualquer skill pode ser usada sozinha ou em conjunto com outras.',
  '- Quando um pattern no código/dados se enquadrar na descrição de uma skill, chame a tool `get_skill_details` com os nomes (ex: {"skills": ["avoid_select_star", "avoid_wildcard_prefix"]}) para receber o manual completo antes de aplicar.',
  '- Os manuais já carregados nesta sessão estão listados em [loaded_skills] e detalhados ao final deste system prompt. Não chame `get_skill_details` para skills já carregadas.',
  '- Combine recomendações de todas as skills aplicáveis na resposta final, priorizando por impacto.',
].join('\n');

/**
 * Monta o system prompt no modelo sob demanda:
 * - catálogo compacto (todas) + manual completo (só carregadas).
 * - `skill` (legado) equivale a uma sessão com só aquela skill carregada.
 * - `skillName` segue exposto como dica de rota por compatibilidade.
 */
export function buildHarnessSystemPrompt({ skill, skillRegistry, loadedSkills, routeHint }) {
  const loaded = Array.isArray(loadedSkills) && loadedSkills.length > 0 ? loadedSkills : skill ? [skill] : [];
  const route = routeHint || (skill && skill.name) || (loaded[0] && loaded[0].name) || 'general_tuning';
  const loadedNames = loaded.map((item) => item.name);

  const parts = [
    AGENT_PERSONA,
    buildCompactSkillCatalog(skillRegistry),
    HARNESS_DEFINITION,
    `[skill_name: ${route}]`,
    `[loaded_skills: ${loadedNames.join(', ')}]`,
    SKILL_DEMAND_GUIDANCE,
  ];

  for (const item of loaded) {
    parts.push(buildFullSkillDetails(item));
  }

  return parts.join('\n\n');
}

export function isolateUserData(messages) {
  return messages.map((message) => {
    if (message.role === 'user' && typeof message.content === 'string') {
      return { ...message, content: `${USER_DATA_OPEN}\n${message.content}\n${USER_DATA_CLOSE}` };
    }
    return message;
  });
}
