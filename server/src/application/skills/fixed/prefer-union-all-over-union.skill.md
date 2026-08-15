---
name: prefer_union_all_over_union
description: Detecta o uso de UNION (que elimina duplicatas) onde UNION ALL (que mantém duplicatas) poderia ser usado, evitando overhead de ordenação/distinção. Também identifica ORs com múltiplas condições desconexas que podem ser reescritas como UNION ALL para melhorar a performance.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - usar union all
  - union em vez de union all
  - trocar union por union all
  - union all em vez de union
  - distinct no union
  - eliminar duplicatas no union
---

# Skill: prefer_union_all_over_union

## Quando usar

Use quando uma consulta contiver:

1. **UNION** entre dois ou mais conjuntos de resultados, onde você tem certeza de que não haverá duplicatas entre eles (ex: critérios mutuamente exclusivos, colunas com valores únicos em cada parte, ou quando a duplicata é aceitável/não prejudica o resultado). Nesse caso, **UNION ALL** é mais performático, pois elimina a etapa de ordenação e remoção de duplicatas.

2. **OR** na cláusula `WHERE` com condições que referenciam colunas diferentes ou que não podem ser aproveitadas por um único índice. Nesses casos, reescrever como `UNION ALL` pode permitir que cada parte use índices específicos e depois combine os resultados, muitas vezes com performance superior, especialmente se as condições forem seletivas.

## Instruções

Sua missão é identificar oportunidades de substituir `UNION` por `UNION ALL` (quando não houver duplicatas ou quando forem aceitáveis) e reescrever `OR` complexos como `UNION ALL` para melhorar o uso de índices e reduzir custos.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Analise a consulta:
   - **Caso 1 (UNION):** Verifique se há `UNION` entre conjuntos. Avalie se as condições de cada parte são mutuamente exclusivas (ex: `WHERE coluna = 'A'` vs `WHERE coluna = 'B'`). Se não houver possibilidade de duplicatas ou se duplicatas não afetarem o resultado, recomende trocar para `UNION ALL`.
   - **Caso 2 (OR):** Identifique `WHERE` com `OR` que combina condições sobre colunas diferentes ou sobre a mesma coluna com valores distintos, e onde um índice separado pode beneficiar cada parte. Se a reescrita para `UNION ALL` for viável, faça-a.
4. Para **UNION → UNION ALL**:
   - Substitua `UNION` por `UNION ALL` e justifique com a ausência de duplicatas ou com a aceitação delas.
5. Para **OR → UNION ALL**:
   - Divida a consulta em duas ou mais consultas separadas, cada uma com uma condição do `OR`, e una-as com `UNION ALL`.
   - Remova o `OR` e adicione o `UNION ALL` entre as partes.
   - Certifique-se de que o resultado final inclui todas as linhas que a consulta original traria (incluindo duplicatas, se for o caso). Se duplicatas não forem desejadas, use `UNION` em vez de `UNION ALL` (mas isso já seria o original, então a reescrita para `UNION ALL` só é válida se duplicatas não importarem).
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita para melhorar a performance. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para alguma parte da consulta, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

### Caso 1: UNION → UNION ALL

**Problema (ANTES):** Uso de `UNION` mesmo quando não há duplicatas, causando overhead de ordenação e remoção de duplicatas.

```sql
-- Exemplo: condições mutuamente exclusivas por cidade
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade = 'Rio de Janeiro'
UNION
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade = 'São Paulo';
```

**Solução (DEPOIS):** Substituir `UNION` por `UNION ALL`, pois as condições são excludentes e não geram duplicatas.

```sql
-- Usando UNION ALL, mais rápido
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade = 'Rio de Janeiro'
UNION ALL
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade = 'São Paulo';
```

**Motivo:** `UNION` executa um `DISTINCT` implícito, que requer ordenação ou hashing dos resultados, consumindo CPU e memória. `UNION ALL` simplesmente concatena os conjuntos, sem verificação de duplicatas, sendo muito mais eficiente. Se as partes são mutuamente exclusivas, não há risco de duplicatas.

---

### Caso 2: OR → UNION ALL

**Problema (ANTES):** Uso de `OR` com condições complexas que impedem o uso eficiente de índices.

```sql
-- Exemplo extraído do PDF: consulta com OR misturando várias condições
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE (nm_cidade = 'Rio de Janeiro' AND nm_bairro <> 'Centro')
   OR (nm_cidade IN ('Belo Horizonte', 'Salvador'))
   OR (nm_cidade IS NULL AND nm_bairro IS NOT NULL);
```

**Solução (DEPOIS):** Reescrever com `UNION ALL`, permitindo que cada condição use índices específicos.

```sql
-- Dividindo as condições em partes separadas com UNION ALL
SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade = 'Rio de Janeiro' AND nm_bairro <> 'Centro'

UNION ALL

SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade IN ('Belo Horizonte', 'Salvador')

UNION ALL

SELECT nm_endereco, nm_bairro, nm_cidade
FROM corp_endereco
WHERE nm_cidade IS NULL AND nm_bairro IS NOT NULL;
```

**Motivo:** O otimizador muitas vezes não consegue usar múltiplos índices efetivamente com `OR` (especialmente se as condições envolvem colunas diferentes). Ao dividir em partes e usar `UNION ALL`, cada parte pode utilizar seu próprio índice (ex: índice em `nm_cidade` para a primeira e segunda partes, e índice em `nm_bairro` para a terceira, dependendo dos índices disponíveis). Isso reduz o custo de leitura e pode melhorar drasticamente a performance.

**Atenção:** Use `UNION ALL` apenas se você tiver certeza de que não haverá duplicatas ou se elas forem aceitáveis no resultado final. Se precisar eliminar duplicatas, use `UNION` (mas nesse caso o ganho de performance é menor). No exemplo, as condições são mutuamente exclusivas (cidades diferentes, ou null vs not null), portanto não há duplicatas.

## Recomendação

- **Sempre prefira `UNION ALL`** quando não houver possibilidade de duplicatas entre as partes. Isso elimina o custo de ordenação/distinção.
- Se houver duplicatas e você não puder eliminá-las logicamente, use `UNION` mesmo assim, mas avalie se é possível reestruturar a consulta para usar `UNION ALL` com um `DISTINCT` no final (às vezes é mais barato).
- Para `OR` complexos, considere a reescrita com `UNION ALL` como uma técnica de *query de-composição* que permite usar índices específicos em cada parte.
- Verifique a existência de índices apropriados para cada parte da consulta. Se faltar índices, emita o handoff para `create_assertive_index`.
- Em consultas com muitas partes, `UNION ALL` pode gerar um plano de execução mais simples e rápido, pois evita operadores de *sort* e *merge*.

---
**⚠️ Importante:** A substituição de `OR` por `UNION ALL` pode aumentar o tamanho do código SQL, mas o ganho de performance costuma compensar em bancos de dados grandes. Sempre teste com dados reais para validar a melhoria.