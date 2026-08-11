export function analyzeSql(sqlText) {
  const text = String(sqlText || '');
  const findings = [];
  const push = (severity, title, detail, suggestion) =>
    findings.push({ severity, title, detail, suggestion });

  const statement = text.split(';')[0] || text;

  if (/\bselect\s+\*/i.test(text)) {
    push(
      'ALTO',
      'Uso de SELECT *',
      'A consulta retorna todas as colunas da tabela.',
      'Liste apenas as colunas realmente necessárias para reduzir I/O, permitir índices de cobertura e evitar quebras por mudança de schema.',
    );
  }

  const whereMatch = statement.match(/\bwhere\b([\s\S]*?)(\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\bunion\b|$)/i);
  const whereClause = whereMatch ? whereMatch[1] : '';

  if (statement.match(/\b(select|delete|update)\b/i) && !statement.match(/\bwhere\b/i)) {
    push(
      'ALTO',
      'Predicado WHERE ausente',
      'A consulta não possui cláusula WHERE, o que força varredura completa.',
      'Adicione um filtro sargável sobre colunas indexadas para limitar as linhas processadas.',
    );
  }

  if (whereClause) {
    const arithmetic = whereClause.match(/\b([a-zA-Z_]\w*)\s*[+\-*/%]\s*\d/i);
    if (arithmetic) {
      push(
        'CRITICO',
        `Aritmética sobre a coluna ${arithmetic[1]}`,
        `O predicado aplica operação aritmética em \`${arithmetic[1]}\` (${arithmetic[0].trim()}), tornando a condição não-sargável. O SQL Server não consegue usar um índice nesta coluna e precisa avaliar linha a linha.`,
        'Reescreva o predicado isolando a coluna, ex: `coluna > 160` em vez de `coluna / 2 * 2 > 80`, ou aplique a aritmética sobre a constante/valor de entrada.',
      );
    }

    const functionOnColumn = whereClause.match(
      /\b(lower|upper|len|isnull|coalesce|substring|convert|cast|dateadd|datediff|year|month|day)\s*\(\s*([a-zA-Z_]\w*)/i,
    );
    if (functionOnColumn) {
      push(
        'CRITICO',
        `Função aplicada à coluna ${functionOnColumn[2]}`,
        `O predicado usa \`${functionOnColumn[1].toUpperCase()}(${functionOnColumn[2]})\`, o que impede o uso de índice na coluna ${functionOnColumn[2]}.`,
        'Isolar a coluna: mover a transformação para o lado do valor comparado (ex: `coluna = CAST(valor AS tipo)`) ou usar colunas persistentes/calculadas indexadas.',
      );
    }

    const leadingLike = whereClause.match(/\b([a-zA-Z_]\w*)\s+like\s+'%\S/i);
    if (leadingLike) {
      push(
        'MEDIO',
        `LIKE com curinga inicial na coluna ${leadingLike[1]}`,
        `O padrão inicia com %, impedindo a busca por índice em \`${leadingLike[1]}\`.`,
        'Se a busca por prefixo não for essencial, considere full-text search ou uma estratégia de índice adequada.',
      );
    }
  }

  if (/\btop\s*\(?\s*\d+/i.test(statement) && !/\border\s+by\b/i.test(statement)) {
    push(
      'MEDIO',
      'TOP sem ORDER BY',
      'O uso de TOP sem ORDER BY torna o resultado não determinístico.',
      'Defina uma ORDER BY explícita quando o conjunto retornado precisa ser previsível.',
    );
  }

  if (findings.length === 0) {
    push(
      'INFO',
      'Nenhum problema óbvio identificado na análise estática',
      'Não foram encontrados padrões críticos de tuning na estrutura textual da consulta.',
      'Confirme o comportamento real com o plano de execução (SHOWPLAN_XML) e as estatísticas de I/O/tempo.',
    );
  }

  return findings;
}

export function extractDatabaseAndTable(sqlText) {
  const text = String(sqlText || '');
  const match = text.match(/from\s+\[?(\w[\w.$.]*)\]?\.(\[\w+\]|\w+)\s*\(?\s*\w+\)?\s*/i);
  if (!match) return { database: null, table: null };
  const parts = match[1].split('.');
  const database = parts.length > 1 ? parts[0] : null;
  const table = (match[2] || '').replace(/[[\]]/g, '');
  return { database, table };
}
