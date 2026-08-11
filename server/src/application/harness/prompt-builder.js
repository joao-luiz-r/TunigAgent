import { AGENT_PERSONA } from '../agent/persona.js';
import { buildSkillCatalog } from '../skills/skill-catalog.js';
import { HARNESS_DEFINITION } from './harness-definition.js';

export const USER_DATA_OPEN = '[[DADOS_DO_USUARIO_INICIO]]';
export const USER_DATA_CLOSE = '[[DADOS_DO_USUARIO_FIM]]';

export function buildHarnessSystemPrompt({ skill, skillRegistry }) {
  return [
    AGENT_PERSONA,
    buildSkillCatalog(skillRegistry),
    HARNESS_DEFINITION,
    `[skill_name: ${skill.name}]`,
    skill.systemPrompt,
  ].join('\n\n');
}

export function isolateUserData(messages) {
  return messages.map((message) => {
    if (message.role === 'user' && typeof message.content === 'string') {
      return { ...message, content: `${USER_DATA_OPEN}\n${message.content}\n${USER_DATA_CLOSE}` };
    }
    return message;
  });
}
