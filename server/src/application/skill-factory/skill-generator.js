import { Skill } from '../../domain/entities/skill.js';
import { AGENT_PERSONA } from '../agent/persona.js';
import { SKILL_GENERATOR_PROMPT } from './prompt-loader.js';

const TOOL_KEYWORDS = [
  { keywords: ['plano', 'plan', 'execu'], toolName: 'get_execution_plan' },
  { keywords: ['schema', 'tabela', 'coluna'], toolName: 'get_table_schema' },
  { keywords: ['indice', 'índice', 'missing', 'ausente'], toolName: 'get_table_indexes' },
  { keywords: ['texto', 'query', 'consulta'], toolName: 'get_query_text' },
  { keywords: ['wait', 'espera'], toolName: 'get_wait_stats' },
  { keywords: ['estatistica', 'estatísticas', 'statistics', 'atualizacao das estatisticas', 'modificacoes de linhas'], toolName: 'get_table_statistics' },
  { keywords: ['chave estrangeira', 'foreign key', 'fk'], toolName: 'get_foreign_keys' },
  { keywords: ['funcao', 'função', 'udf', 'inlineable', 'is_inlineable', 'procedimento'], toolName: 'get_object_metadata' },
];

export class SkillGenerator {
  constructor({ llm, toolRegistry }) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
  }

  inferTools(dataNeeded) {
    const text = String(dataNeeded || '').toLowerCase();
    const names = [];
    for (const rule of TOOL_KEYWORDS) {
      if (rule.keywords.some((keyword) => text.includes(keyword))) {
        if (!names.includes(rule.toolName)) names.push(rule.toolName);
      }
    }
    if (names.length === 0) names.push('get_execution_plan');
    return names.filter((name) => this.toolRegistry.has(name));
  }

  async generate(answers) {
    const name = String(answers.name || 'nova_skill').trim() || 'nova_skill';
    const toolsRequired = this.inferTools(answers.dataNeeded);
    const fallback = new Skill({
      name,
      description: answers.trigger || 'Técnica de otimização ensinada pelo usuário.',
      systemPrompt: this.buildFallbackPrompt(answers, toolsRequired),
      toolsRequired,
      detectionRules: { type: 'custom', trigger: answers.trigger || '' },
      recommendationTemplate: answers.recommendation || '',
      pattern: this.buildFallbackPattern(answers),
      source: 'factory',
    });
    try {
      const generated = await this.llm.chatJson({
        system: [AGENT_PERSONA, SKILL_GENERATOR_PROMPT].join('\n\n'),
        messages: [{ role: 'user', content: JSON.stringify(answers) }],
      });
      return new Skill({
        name,
        description: generated.description || fallback.description,
        systemPrompt: generated.systemPrompt || fallback.systemPrompt,
        toolsRequired,
        detectionRules: generated.detectionRules || fallback.detectionRules,
        recommendationTemplate: generated.recommendationTemplate || fallback.recommendationTemplate,
        pattern: generated.pattern || fallback.pattern,
        source: 'factory',
      });
    } catch {
      return fallback;
    }
  }

  buildFallbackPrompt(answers, toolsRequired) {
    const tools = toolsRequired.length > 0 ? toolsRequired.join(', ') : 'nenhuma (dados informados pelo usuário)';
    return [
      `Você é uma skill de diagnóstico chamada "${answers.name}".`,
      `Descrição da técnica: ${answers.trigger || 'não informada'}.`,
      `Recomendação típica: ${answers.recommendation || 'não informada'}.`,
      `Script de verificação: ${answers.script || 'nenhum'}.`,
      `Use as ferramentas de coleta disponíveis: ${tools}.`,
      'Analise os dados coletados, verifique a condição de disparo e aplique a técnica.',
      'Conclua sempre com uma recomendação objetiva e acionável.',
    ].join(' ');
  }

  buildFallbackPattern(answers) {
    return {
      problem: answers.trigger || 'Técnica de otimização ensinada pelo usuário.',
      solution: answers.recommendation || 'Aplicar a técnica recomendada.',
      beforeScript: answers.script || '',
      afterScript: answers.script || '',
      reason: 'Técnica ensinada pelo usuário através da Skill Factory.',
    };
  }
}
