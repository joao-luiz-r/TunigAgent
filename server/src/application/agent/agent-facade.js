import { ApiError } from '../errors/api-error.js';
import { FACTORY_SKILL_NAME } from '../skill-factory/interview-steps.js';
import { AUTO_SKILL_NAME } from '../skills/skill-matcher.js';
import { Skill } from '../../domain/entities/skill.js';

export const WELCOME_MESSAGE = `Online e operacional.

Envie o contexto do problema de performance para iniciar a análise. O ideal é fornecer, nesta ordem de prioridade:

1. Código-fonte da query/procedure (T-SQL) que está lenta.
2. Plano de execução real (XML ou screenshot do SSMS), se disponível.
3. Schema das tabelas envolvidas (tipos de colunas, PK, FK).
4. Índices existentes e estimativa de volume de linhas.

Sem isso, posso apenas coletar dados de forma genérica. Se preferir, comece colando a query — a análise estrutural já permite identificar gargalos de sargabilidade, conversões implícitas, SELECT *, heaps e padrões de scan antes mesmo do plano de execução.

Qual é o cenário?`;

export class AgentFacade {
  constructor({ sessionManager, harness, skillRegistry, skillLoader }) {
    this.sessionManager = sessionManager;
    this.harness = harness;
    this.skillRegistry = skillRegistry;
    this.skillLoader = skillLoader;
  }

  async startSession(skillName) {
    const name = skillName || AUTO_SKILL_NAME;
    if (name !== AUTO_SKILL_NAME && !this.skillRegistry.get(name)) {
      throw new ApiError(404, `Skill "${name}" não encontrada`);
    }
    const session = this.sessionManager.create(name);
    if (name === FACTORY_SKILL_NAME) {
      await this.harness.prepareFactorySession(session);
    } else {
      session.history.push({ role: 'assistant', content: WELCOME_MESSAGE });
      this.sessionManager.save(session);
    }
    return session.toPublicState();
  }

  async act(sessionId, message) {
    if (!sessionId) throw new ApiError(400, 'O campo sessionId é obrigatório');
    if (!message || !String(message).trim()) throw new ApiError(400, 'O campo message é obrigatório');
    return this.harness.handleAct(sessionId, String(message).trim());
  }

  async feedback(sessionId, userResult) {
    if (!sessionId) throw new ApiError(400, 'O campo sessionId é obrigatório');
    if (!userResult) throw new ApiError(400, 'O campo userResult é obrigatório');
    return this.harness.handleFeedback(sessionId, String(userResult));
  }

  async getState(sessionId) {
    const session = this.sessionManager.get(sessionId);
    if (!session) throw new ApiError(404, 'Sessão não encontrada');
    return session.toPublicState();
  }

  listSkills() {
    return this.skillRegistry.list();
  }

  async createSkill(payload) {
    const name = payload && payload.name;
    if (!name) throw new ApiError(400, 'O campo name é obrigatório');
    if (this.skillRegistry.get(name)) throw new ApiError(409, `Já existe uma skill chamada "${name}"`);
    const skill = new Skill({
      name,
      description: payload.description || '',
      systemPrompt: payload.systemPrompt || '',
      toolsRequired: Array.isArray(payload.toolsRequired) ? payload.toolsRequired : [],
      detectionRules: payload.detectionRules || null,
      recommendationTemplate: payload.recommendationTemplate || null,
      source: 'factory',
    });
    await this.skillLoader.registerDynamic(skill);
    return skill.toMetadata();
  }
}
