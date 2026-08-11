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
