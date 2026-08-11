const FIX_PATTERN = /create\s+(clustered|nonclustered)?\s*(index|table|view|procedure|function)|alter\s+(table|index|view)|update\s+\w+|delete\s+from|rewrite|reescrev|exists|covering|include|temporal|filtrad|\bisnull\b|\bnot\s+null\b/i;

const IMPROVEMENT_PATTERN = /lent|melhor|resolveu|corrig|otimiz|ganh|reduz|aumentou|performance|melhoria|ficou|antes|depois|ms\b|segundo/i;

export class SkillFactoryDetector {
  detect(message) {
    const text = String(message || '');
    return FIX_PATTERN.test(text) && IMPROVEMENT_PATTERN.test(text);
  }

  isCreationRequest(message) {
    const text = String(message || '').toLowerCase();
    return /(criar|quero|nova)\s+(uma\s+)?skill|skill\s*factory|transformar.*skill|ensinar.*nova.*(regra|t[eé]cnica)/.test(
      text,
    );
  }
}
