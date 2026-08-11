export const AUTO_SKILL_NAME = 'auto';

const SKILL_KEYWORDS = {
  avoid_select_star: [
    'select *',
    'select star',
    'todas as colunas',
    'listar colunas',
    'colunas desnecessarias',
    'colunas excedentes',
  ],
  detect_implicit_conversion: [
    'conversao implicita',
    'conversao de tipo',
    'tipo diferente',
    'tipos diferentes',
    'incompatibilidade de tipo',
    'convert_implicit',
    'coluna varchar',
    'coluna nvarchar',
  ],
  ensure_fk_indexes: [
    'chave estrangeira',
    'foreign key',
    'fk sem indice',
    'indice na fk',
    'join lento',
    'exclusao de registro pai',
    'table scan em join',
  ],
  key_lookup_elimination: [
    'key lookup',
    'lookup',
    'indice de cobertura',
    'colunas no include',
    'covering index',
    'clustered index seek',
  ],
  avoid_non_sargable_predicate: [
    'nao sargavel',
    'non sargable',
    'funcao na coluna',
    'aritmetica na coluna',
    'year(',
    'coluna /',
    'expressao na coluna',
    'operacao na coluna',
  ],
  avoid_wildcard_prefix: [
    'like %',
    'curinga no inicio',
    'wildcard prefix',
    'busca por texto completo',
    'fulltext',
  ],
  avoid_heap_table: [
    'tabela heap',
    'sem clustered',
    'sem indice clustered',
    'heap table',
    'forwarding',
    'clustered index ausente',
  ],
  recommend_missing_index: [
    'indice ausente',
    'missing index',
    'indices ausentes',
    'sugestao de indice',
  ],
  create_assertive_index: [
    'criar indice',
    'criar um indice',
    'criar indice de cobertura',
    'criar indices',
    'novo indice',
    'indice para melhorar',
    'improve index',
    'add index',
    'sugestao de criar indice',
    'cobrir a consulta',
    'cobertura de consulta',
    'expandir indice',
    'acrescentar na chave',
    'include',
  ],
  refresh_stale_statistics: [
    'estatistica desatualizada',
    'statistics desatualizada',
    'stale statistics',
    'update statistics',
    'cardinalidade errada',
    'row modification',
  ],
  set_based_instead_of_cursor: [
    'cursor',
    'loop linha a linha',
    'linha a linha',
    'set based',
    'baseado em conjuntos',
    'while + update',
  ],
};

export class SkillMatcher {
  constructor({ skillRegistry }) {
    this.skillRegistry = skillRegistry;
  }

  match(message) {
    const text = this.normalize(message);
    let bestName = null;
    let bestScore = 0;

    for (const [skillName, keywords] of Object.entries(SKILL_KEYWORDS)) {
      const score = keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        bestName = skillName;
      }
    }

    for (const skill of this.skillRegistry.all()) {
      if (skill.source !== 'factory' || !skill.detectionRules) continue;
      const trigger = this.normalize(skill.detectionRules.trigger || '');
      const words = trigger.split(/\s+/).filter((word) => word.length > 3);
      const score = words.reduce((acc, word) => (text.includes(word) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        bestName = skill.name;
      }
    }

    return bestName ? this.skillRegistry.get(bestName) : null;
  }

  normalize(message) {
    return String(message || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
