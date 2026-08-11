export class MockLlm {
  constructor() {
    this.interviewMarker = 'SKILL_FACTORY_INTERVIEW';
  }

  async createChatCompletion({ system, messages, tools }) {
    if (system && system.includes(this.interviewMarker)) {
      return { content: this.buildInterviewQuestion(system) };
    }
    const hasToolResult = messages.some((message) => message.role === 'tool');
    if (!hasToolResult && tools && tools.length > 0) {
      const first = tools[0].function;
      return {
        content: null,
        tool_calls: [
          {
            id: `mock_${Date.now()}`,
            type: 'function',
            function: { name: first.name, arguments: JSON.stringify({}) },
          },
        ],
      };
    }
    return { content: this.buildAnalysis(system, messages) };
  }

  async chatJson({ system, messages }) {
    const answers = {};
    for (const message of messages) {
      if (message.role === 'user') {
        try {
          Object.assign(answers, JSON.parse(message.content));
        } catch {
          // ignora conteúdo não-JSON
        }
      }
    }
    return {
      description: answers.trigger || 'Técnica de otimização ensinada pelo usuário.',
      systemPrompt: [
        `Você é a skill de diagnóstico "${answers.name || 'nova skill'}".`,
        `Descrição da técnica: ${answers.trigger || 'não informada'}.`,
        `Recomendação típica: ${answers.recommendation || 'não informada'}.`,
        `Script de verificação: ${answers.script || 'nenhum'}.`,
        'Analise os dados coletados, verifique a condição de disparo e aplique a técnica.',
        'Conclua sempre com uma recomendação objetiva e acionável.',
      ].join(' '),
      detectionRules: { type: 'custom', trigger: answers.trigger || '' },
      recommendationTemplate: answers.recommendation || '',
    };
  }

  buildAnalysis(system, messages) {
    const skillName = this.extractSkillName(system);
    const facts = messages
      .filter((message) => message.role === 'tool')
      .map((message) => {
        try {
          return JSON.parse(message.content);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const report = [`## Análise de tuning (${skillName})`, ''];

    const schema = facts.find((fact) => fact.columns && fact.columns.some((c) => c === 'coluna' || c === 'indice'));
    const queryText = facts.find((fact) => fact.columns && fact.columns.some((c) => c === 'texto_consulta'));

    if (facts.length === 0) {
      report.push('Nenhum dado foi coletado ainda. Execute o script sugerido no SSMS e cole o resultado.');
      return report.join('\n');
    }

    if (skillName === 'avoid_select_star' && queryText) {
      const hasStar = queryText.rows.some((row) => String(row.texto_consulta || '').toLowerCase().includes('select *'));
      if (hasStar) {
        report.push('**Diagnóstico:** a consulta usa `SELECT *`.');
        report.push('');
        report.push('**Recomendação:** substitua `SELECT *` pela lista explícita das colunas realmente necessárias. Isso reduz I/O, permite índices de cobertura e evita quebras por mudança de schema.');
      } else {
        report.push('**Diagnóstico:** nenhum `SELECT *` evidente foi encontrado nas consultas coletadas.');
        report.push('');
        report.push('**Recomendação:** revise manualmente as consultas de maior custo e garanta que listem apenas as colunas necessárias.');
      }
      return report.join('\n');
    }

    if (skillName === 'detect_implicit_conversion' && (schema || queryText)) {
      report.push('**Diagnóstico:** análise de conversões implícitas nos predicados WHERE/JOIN.');
      report.push('');
      report.push('**Recomendação:** verifique se colunas são comparadas com valores ou parâmetros de tipo diferente (ex: VARCHAR vs NVARCHAR, INT vs string). Alinhe os tipos com CAST/CONVERT no lado do valor para permitir o uso de índices.');
      return report.join('\n');
    }

    if (skillName === 'ensure_fk_indexes' && schema) {
      report.push('**Diagnóstico:** verificação de índices de suporte para colunas de chave estrangeira.');
      report.push('');
      report.push('**Recomendação:** confira se toda coluna de FK possui um índice cobrindo-a. Quando ausente, crie: `CREATE INDEX IX_{tabela}_{coluna} ON {tabela} ({coluna});` para evitar table scans em joins e exclusões.');
      return report.join('\n');
    }

    if (skillName === 'key_lookup_elimination') {
      report.push('**Diagnóstico:** busca por operações Key Lookup (Clustered) no plano de execução.');
      report.push('');
      report.push('**Recomendação:** identifique as colunas buscadas além do índice usado e crie um índice de cobertura: `CREATE INDEX IX_{tabela}_Covering ON {tabela} (predicado) INCLUDE (colunas_ausentes);`.');
      return report.join('\n');
    }

    report.push('**Diagnóstico:** análise geral de performance baseada nos dados coletados.');
    report.push('');
    report.push('**Recomendação:** priorize a investigação de:');
    report.push('- Wait stats dominantes (`get_wait_stats`);');
    report.push('- Plano de execução para scans e lookups (`get_execution_plan`).');
    report.push('');
    report.push('Refine a consulta e avalie a criação dos índices sugeridos antes de reexecutar.');
    return report.join('\n');
  }

  extractSkillName(system) {
    const match = String(system || '').match(/\[skill_name:\s*([a-z0-9_]+)\]/i);
    return match ? match[1] : 'general_tuning';
  }

  buildInterviewQuestion(system) {
    const match = system.match(/tópico:\s*"([^"]+)"/i);
    if (match) return match[1];
    return 'Pergunta da entrevista da Skill Factory.';
  }
}
