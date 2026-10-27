function singleLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function quoted(text) {
  return `"${singleLine(text).replace(/"/g, "'")}"`;
}

/**
 * Serializa uma Skill para o formato .skill.md (round-trip com skillFromMarkdown).
 */
export function skillToMarkdown(skill) {
  const lines = ['---', `name: ${skill.name}`, `description: ${quoted(skill.description || '')}`];

  if (skill.toolsRequired && skill.toolsRequired.length > 0) {
    lines.push('tools:');
    for (const tool of skill.toolsRequired) lines.push(`  - ${tool}`);
  }
  if (skill.keywords && skill.keywords.length > 0) {
    lines.push('keywords:');
    for (const keyword of skill.keywords) lines.push(`  - ${keyword}`);
  }

  lines.push('---', '', `# Skill: ${skill.name}`, '', '## Quando usar', '');

  const whenToUse =
    (skill.detectionRules && skill.detectionRules.description) || skill.description || '';
  lines.push(whenToUse.trim(), '', '## Instruções', '', (skill.systemPrompt || '').trim(), '');

  lines.push('## Padrão ANTES/DEPOIS', '');
  const pattern = skill.pattern || {};
  if (pattern.problem) lines.push(`**Problema (ANTES):** ${singleLine(pattern.problem)}`, '');
  if (pattern.solution) lines.push(`**Solução (DEPOIS):** ${singleLine(pattern.solution)}`, '');
  if (pattern.beforeScript) {
    lines.push('**Script ANTES:**', '', '```sql', String(pattern.beforeScript).trim(), '```', '');
  }
  if (pattern.afterScript) {
    lines.push('**Script DEPOIS:**', '', '```sql', String(pattern.afterScript).trim(), '```', '');
  }
  if (pattern.reason) lines.push(`**Motivo:** ${singleLine(pattern.reason)}`, '');

  if (skill.recommendationTemplate) {
    lines.push('## Recomendação', '', String(skill.recommendationTemplate).trim(), '');
  }

  return `${lines.join('\n').trim()}\n`;
}
