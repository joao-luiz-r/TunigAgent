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
      const first = tools.map((tool) => tool.function).find((fn) => fn.name !== 'get_skill_details');
      if (first) {
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
      keywords: String(answers.keywords || '')
        .split(/[,;\n]+/)
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 1)
        .filter((keyword, index, all) => all.indexOf(keyword) === index)
        .slice(0, 20),
    };
  }

  buildAnalysis(system, messages) {
    const skillNames = this.extractLoadedSkills(system);
    const routeHint = this.extractSkillName(system);
    if (!skillNames.includes(routeHint)) skillNames.push(routeHint);
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

    const report = [`## Análise de tuning (${skillNames.join('+') || 'general_tuning'})`, ''];

    const schema = facts.find((fact) => fact.columns && fact.columns.some((c) => c === 'coluna' || c === 'indice'));
    const queryText = facts.find((fact) => fact.columns && fact.columns.some((c) => c === 'texto_consulta'));
    const has = (name) => skillNames.includes(name);

    if (facts.length === 0) {
      report.push('Nenhum dado foi coletado ainda. Execute o script sugerido no SSMS e cole o resultado.');
      return report.join('\n');
    }

    const sections = [];

    if (has('avoid_select_star') && queryText) {
      const hasStar = queryText.rows.some((row) => String(row.texto_consulta || '').toLowerCase().includes('select *'));
      if (hasStar) {
        sections.push(
          '**Diagnóstico:** a consulta usa `SELECT *`.',
          '',
          '**Recomendação:** substitua `SELECT *` pela lista explícita das colunas realmente necessárias. Isso reduz I/O, permite índices de cobertura e evita quebras por mudança de schema.',
        );
      } else {
        sections.push(
          '**Diagnóstico:** nenhum `SELECT *` evidente foi encontrado nas consultas coletadas.',
          '',
          '**Recomendação:** revise manualmente as consultas de maior custo e garanta que listem apenas as colunas necessárias.',
        );
      }
    }

    if (has('avoid_wildcard_prefix') && queryText) {
      const hasLike = queryText.rows.some((row) => String(row.texto_consulta || '').toLowerCase().includes('like'));
      if (hasLike) {
        sections.push(
          '**Diagnóstico:** predicado LIKE com curinga inicial (`%valor`), não-sargável.',
          '',
          '**Recomendação:** reescreva para busca por prefixo (`valor%`) ou use Full-Text Search quando a regra de negócio exigir busca por sufixo/meio.',
        );
      }
    }

    if (has('avoid_non_sargable_predicate')) {
      sections.push(
        '**Diagnóstico:** predicado não-sargável (função ou aritmética sobre coluna no WHERE).',
        '',
        '**Recomendação:** isole a coluna: mova a transformação para o lado do valor comparado (ex: `data_pedido >= ... AND data_pedido < ...` em vez de `YEAR(data_pedido) = 2026`) para permitir Index Seek.',
      );
    }

    if (has('detect_implicit_conversion') && (schema || queryText)) {
      sections.push(
        '**Diagnóstico:** análise de conversões implícitas nos predicados WHERE/JOIN.',
        '',
        '**Recomendação:** verifique se colunas são comparadas com valores ou parâmetros de tipo diferente (ex: VARCHAR vs NVARCHAR, INT vs string). Alinhe os tipos com CAST/CONVERT no lado do valor para permitir o uso de índices.',
      );
    }

    if (has('ensure_fk_indexes') && schema) {
      sections.push(
        '**Diagnóstico:** verificação de índices de suporte para colunas de chave estrangeira.',
        '',
        '**Recomendação:** confira se toda coluna de FK possui um índice cobrindo-a. Quando ausente, crie: `CREATE INDEX IX_{tabela}_{coluna} ON {tabela} ({coluna});` para evitar table scans em joins e exclusões.',
      );
    }

    if (has('key_lookup_elimination')) {
      sections.push(
        '**Diagnóstico:** busca por operações Key Lookup (Clustered) no plano de execução.',
        '',
        '**Recomendação:** identifique as colunas buscadas além do índice usado e crie um índice de cobertura: `CREATE INDEX IX_{tabela}_Covering ON {tabela} (predicado) INCLUDE (colunas_ausentes);`.',
      );
    }

    if (sections.length === 0) {
      for (const name of skillNames) {
        if (name === 'general_tuning') continue;
        const details = this.extractSkillDetailsFromSystem(system, name);
        if (details && (details.problem || details.recommendation || details.solution)) {
          sections.push(
            `**Diagnóstico:** ${details.problem || `Análise focada na técnica ${name}.`}`,
            '',
            `**Recomendação:** ${details.recommendation || details.solution || `Aplicar a técnica recomendada para ${name}.`}`,
          );
        }
      }
    }

    if (sections.length === 0) {
      report.push('**Diagnóstico:** análise geral de performance baseada nos dados coletados.');
      report.push('');
      report.push('**Recomendação:** priorize a investigação de:');
      report.push('- Wait stats dominantes (`get_wait_stats`);');
      report.push('- Plano de execução para scans e lookups (`get_execution_plan`).');
      report.push('');
      report.push('Refine a consulta e avalie a criação dos índices sugeridos antes de reexecutar.');
      return report.join('\n');
    }

    report.push(sections.join('\n\n'));
    return report.join('\n');
  }

  extractSkillDetailsFromSystem(system, name) {
    const text = String(system || '');
    const header = `## ${name}`;
    const start = text.indexOf(header);
    if (start === -1) return null;
    const block = text.slice(start);
    const nextHeader = block.indexOf('\n## ', 4);
    const skillBlock = nextHeader === -1 ? block : block.slice(0, nextHeader);

    const probMatch =
      skillBlock.match(/\*\*Problema \(ANTES\)[^*]*\*\*:\s*([^\r\n]+)/) ||
      skillBlock.match(/\*\*Problema \(ANTES\)[^*]*\*\*\s*([^\r\n]+)/);
    const solMatch =
      skillBlock.match(/\*\*Solução \(DEPOIS\)[^*]*\*\*:\s*([^\r\n]+)/) ||
      skillBlock.match(/\*\*Solução \(DEPOIS\)[^*]*\*\*\s*([^\r\n]+)/);
    const recMatch = skillBlock.match(/\*\*Recomendação:\*\*\s*([\s\S]+?)(?:\r?\n\r?\n\*\*|\r?\n##|$)/);

    return {
      problem: probMatch ? probMatch[1].trim() : null,
      solution: solMatch ? solMatch[1].trim() : null,
      recommendation: recMatch ? recMatch[1].replace(/\[SKILL_HANDOFF:[^\]]+\]/gi, '').trim() : null,
    };
  }

  extractLoadedSkills(system) {
    const match = String(system || '').match(/\[loaded_skills:\s*([^\]]*)\]/i);
    if (!match) return [];
    return match[1]
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
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
