---
name: avoid_wildcard_prefix
description: Detecta cláusulas LIKE com curinga no início (`%valor` ou `%valor%`) que tornam o predicado não-sargável, forçando Index Scan, e recomenda reescrita para prefixo (`valor%`) ou o uso de Full-Text Search quando a lógica de negócio exigir busca por sufixo/meio.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - wildcard prefix
  - curinga no inicio
  - like percentual no inicio
  - like com % no inicio
  - prefixo curinga
  - busca por sufixo
---

# Skill: avoid_wildcard_prefix

## Quando usar

Use quando um predicado `LIKE` começa com curinga (`LIKE '%abc'` ou `LIKE '%abc%'`), tornando a busca não-sargável e forçando scan. Nesse formato, o SQL Server não consegue usar um índice na coluna para realizar um *Index Seek*, sendo forçado a executar um *Index Scan* (ou *Table Scan*), o que degrada significativamente a performance em tabelas grandes.

## Instruções

Sua missão é identificar padrões `LIKE` não-sargáveis que utilizam curinga no início. Diferentemente de outras funções, nem sempre é possível reescrever um `LIKE '%valor'` para uma forma sargável equivalente mantendo exatamente a mesma lógica. Portanto, siga o fluxo abaixo:

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes da tabela envolvida com `get_table_indexes`.
3. Avalie a cláusula `LIKE`:
   - Se o padrão for **prefixado** (`LIKE 'valor%'`) → já é sargável (Index Seek). Apenas documente isso.
   - Se o padrão for **sufixado** (`LIKE '%valor'`) ou **contido** (`LIKE '%valor%'`) → não é sargável (Index Scan).
4. **Recomendação primária**: Verifique se a regra de negócio pode ser ajustada para buscar apenas pelo prefixo (`LIKE 'valor%'`), mantendo o mesmo resultado esperado. Se sim, reescreva.
5. **Recomendação secundária**: Se a busca por sufixo ou substring for estritamente necessária e a tabela for muito volumosa, recomende explicitamente a avaliação de **Full-Text Search** (índices FULLTEXT), que é a abordagem correta para esse tipo de busca, em vez de tentar forçar um Index Seek com `LIKE`.
6. **SEGREGAÇÃO DE RESPONSABILIDADES**: Esta skill trata APENAS da análise e reescrita (quando possível) do predicado `LIKE`. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`) para este caso específico, pois índices tradicionais B-Tree não resolvem buscas por sufixo.
   - Se a reescrita para prefixo for possível e um índice adequado já existir, apenas indique isso.
   - Se a reescrita para prefixo for possível mas faltar um índice, conclua a análise com a reescrita e acione a skill de criação de índices emitindo o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - Se a reescrita NÃO for possível (necessidade real de sufixo/substring), **NÃO** emita handoff para `create_assertive_index`, pois um índice comum não resolverá. Em vez disso, recomende a implementação de Full-Text Search.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Curinga no início da string, forçando o SQL Server a varrer a tabela inteira (Index Scan) para encontrar correspondências.

```sql
-- Exemplo 1: Busca por sufixo (não-sargável)
SELECT * FROM Dealer
WHERE DealerName LIKE '%Ford';

-- Exemplo 2: Busca por substring (não-sargável)
SELECT * FROM Clientes
WHERE Nome LIKE '%Silva%';
```

**Solução (DEPOIS):** Reescrever para busca por prefixo, se a lógica de negócio permitir. Caso contrário, indicar a limitação e sugerir Full-Text Search.

```sql
-- Caso 1: Se a intenção for buscar nomes que *começam* com "Ford"
SELECT * FROM Dealer
WHERE DealerName LIKE 'Ford%'; -- Sargável (Index Seek)

-- Caso 2: Se a intenção for buscar nomes que *terminam* com "Silva" ou contenham "Silva"
-- NÃO é possível reescrever com LIKE mantendo a mesma lógica.
-- Recomendação: Criar um índice FULLTEXT na coluna Nome e usar CONTAINS, ex:
-- SELECT * FROM Clientes WHERE CONTAINS(Nome, 'Silva');
```

**Motivo:** O operador LIKE só é sargável quando o padrão possui caracteres curinga (% ou _) após a string literal ('valor%'). Quando o curinga aparece antes ('%valor') ou em ambos os lados ('%valor%'), o otimizador não consegue usar a ordenação do índice B-Tree para localizar os registros rapidamente, resultando em varredura total (scan).

## Recomendação

Sempre que encontrar um LIKE com curinga no início:
Questione o requisito: "É absolutamente necessário buscar por sufixo ou substring, ou podemos buscar apenas pelo prefixo?"
Se puder ser prefixo, reescreva para LIKE 'valor%' e verifique os índices existentes. Se não houver índice, acione [SKILL_HANDOFF:create_assertive_index].
Se for estritamente necessário manter o sufixo/substring, documente a não-sargabilidade e recomende a adoção de Full-Text Search, informando que índices tradicionais não são eficazes para essa operação. Nesse cenário, NÃO acione create_assertive_index.

---
**⚠️ Importante:** Esta skill não gera scripts de CREATE INDEX para buscas por sufixo, pois seriam inefetivos. A responsabilidade de avaliar e implementar Full-Text Search é do time de arquitetura/DBA, devendo ser tratada fora do escopo destas skills automatizadas.