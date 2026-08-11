const OBJECT_PATTERN =
  /\b(índice|indice|index|tabela|table|schema|coluna|column|estat[ií]stica|statistics|constraint|primary\s+key)\b/i;

const CHANGE_PATTERN =
  /\b(criei|criado|recriei|recriado|dropei|dropado|remove[ui]|removi|exclu[ií]|alter[ei]|atualiz|update\s+|rebuild|reorganiz|adicion[ei]|renome[ei]|mudou|mudaram|troquei|trocou|modific[ei]|truncate|execute)\b/i;

export class DataChangeDetector {
  detect(message) {
    const text = String(message || '');
    return OBJECT_PATTERN.test(text) && CHANGE_PATTERN.test(text);
  }
}
