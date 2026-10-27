export function buildCompactSkillCatalog(skillRegistry, { includeFactory = false } = {}) {
  const skills = skillRegistry
    .all()
    .filter((skill) => skill.enabled && (includeFactory || !skill.isFactory))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    '# Catálogo de Skills',
    '',
    'Consulte esta referência para saber qual skill aplicar ao problema.',
    '',
  ];

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }

  return lines.join('\n').trim();
}

export function buildFullSkillDetails(skill) {
  const parts = [`## ${skill.name}`, ''];

  if (skill.description) {
    parts.push(`**Quando usar:** ${skill.description}`, '');
  }
  if (skill.systemPrompt) {
    parts.push(skill.systemPrompt, '');
  }

  if (skill.pattern) {
    if (skill.pattern.problem) parts.push(`**Problema (ANTES):** ${skill.pattern.problem}`, '');
    if (skill.pattern.solution) parts.push(`**Solução (DEPOIS):** ${skill.pattern.solution}`, '');
    if (skill.pattern.beforeScript) {
      parts.push('**Script ANTES:**', '```sql', skill.pattern.beforeScript, '```', '');
    }
    if (skill.pattern.afterScript) {
      parts.push('**Script DEPOIS:**', '```sql', skill.pattern.afterScript, '```', '');
    }
    if (skill.pattern.reason) parts.push(`**Motivo:** ${skill.pattern.reason}`, '');
  }

  if (skill.recommendationTemplate) {
    parts.push(`**Recomendação:** ${skill.recommendationTemplate}`, '');
  }
  if (skill.toolsRequired && skill.toolsRequired.length > 0) {
    parts.push(`**Ferramentas:** ${skill.toolsRequired.join(', ')}`);
  }

  return parts.join('\n').trim();
}

export function buildSkillCatalog(skillRegistry, { includeFactory = false } = {}) {
  const skills = skillRegistry
    .all()
    .filter((skill) => skill.enabled && (includeFactory || !skill.isFactory))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    '# 📚 Catálogo de Skills Disponíveis',
    '',
    'Consulte esta referência para escolher a skill que melhor se aplica ao problema.',
    'Cada skill traz o padrão ANTES/DEPOIS que guia o diagnóstico e a solução.',
    '',
  ];

  for (const skill of skills) {
    lines.push(`## ${skill.name}`);
    lines.push('');
    lines.push(`**Quando usar:** ${skill.description}`);
    if (skill.pattern) {
      lines.push('');
      if (skill.pattern.problem) {
        lines.push(`**Problema (ANTES):** ${skill.pattern.problem}`);
      }
      if (skill.pattern.solution) {
        lines.push(`**Solução (DEPOIS):** ${skill.pattern.solution}`);
      }
      if (skill.pattern.beforeScript) {
        lines.push('');
        lines.push('**Script ANTES:**');
        lines.push('```sql');
        lines.push(skill.pattern.beforeScript);
        lines.push('```');
      }
      if (skill.pattern.afterScript) {
        lines.push('');
        lines.push('**Script DEPOIS:**');
        lines.push('```sql');
        lines.push(skill.pattern.afterScript);
        lines.push('```');
      }
      if (skill.pattern.reason) {
        lines.push('');
        lines.push(`**Motivo:** ${skill.pattern.reason}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
