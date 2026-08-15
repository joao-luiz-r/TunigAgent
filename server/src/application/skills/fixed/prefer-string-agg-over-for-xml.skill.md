---
name: prefer_string_agg_over_for_xml
description: Detecta o uso antigo de FOR XML PATH para concatenação de strings e recomenda a substituição por STRING_AGG (SQL Server 2017+), que é mais performático, legível e preserva caracteres especiais sem distorções. Inclui ressalvas sobre Memory Grant excessivo em colunas grandes.
tools:
  - get_query_text
  - get_table_indexes
keywords:
  - for xml path
  - string agg
  - concatenacao de strings
  - usar string_agg
  - for xml para concatenar
  - stuff for xml
---

# Skill: prefer_string_agg_over_for_xml

## Quando usar

Use quando uma consulta utiliza o padrão `FOR XML PATH('')` para concatenar valores de múltiplas linhas em uma única string, especialmente com `STUFF` para remover separadores extras. Esse padrão era comum antes do SQL Server 2017, mas tem várias desvantagens:

- **Performance inferior** – `FOR XML PATH` gera XML internamente, com overhead de parsing e formatação.
- **Distorce caracteres especiais** – converte automaticamente caracteres como `&`, `<`, `>` em entidades XML (`&amp;`, `&lt;`, `&gt;`), exigindo tratamento adicional para restaurar o texto original.
- **Código confuso** – a sintaxe com `STUFF`, `TYPE`, `.value()` é difícil de ler e manter.

O SQL Server 2017+ introduziu a função `STRING_AGG`, que é:

- **Mais rápida** – otimizada para agregação de strings.
- **Preserva caracteres** – mantém o texto exatamente como está, sem conversões indesejadas.
- **Mais legível** – sintaxe clara e direta.

## Instruções

Sua missão é identificar concatenações com `FOR XML PATH` e reescrevê-las usando `STRING_AGG`, mantendo a mesma lógica e resultado.

1. Colete o texto da consulta com `get_query_text`.
2. Colete os índices existentes das tabelas envolvidas com `get_table_indexes`.
3. Identifique o padrão:
   - Subconsulta com `FOR XML PATH('')` e `STUFF` removendo separadores.
   - Uso de `TYPE` e `.value()` para converter o XML para string.
4. Reescreva a consulta:
   - Substitua a subconsulta + `STUFF` por `STRING_AGG(expressão, separador)`.
   - Adicione `WITHIN GROUP (ORDER BY ...)` se a ordenação for necessária.
   - Use `CAST` para `VARCHAR(MAX)` se houver risco de truncamento (opcional, mas recomendado para segurança).
5. **Atenção à ressalva do PDF:** Com colunas muito grandes (`VARCHAR(MAX)`) e a cláusula `WITHIN GROUP (ORDER BY ...)`, o `STRING_AGG` pode solicitar um **Memory Grant excessivo** e causar *spills* de disco. Em cenários pesados, monitore o plano real e, se necessário, recue para `FOR XML PATH`. Isso deve ser mencionado na recomendação, mas a preferência é sempre por `STRING_AGG` quando viável.
6. **SEGREGAÇÃO DE RESPONSABILIDADES:** Esta skill trata APENAS da reescrita da concatenação. Ela NÃO propõe, gera ou recomenda diretamente scripts de criação de índice (`CREATE INDEX`).
   - Se a reescrita permitir o uso de índices existentes, mencione isso.
   - Se faltar índices para as colunas envolvidas, acione a skill de criação de índices com o marcador: `[SKILL_HANDOFF:create_assertive_index]`.
   - NUNCA emita um script `CREATE INDEX` diretamente nesta skill.

## Padrão ANTES/DEPOIS

**Problema (ANTES):** Uso de `FOR XML PATH` para concatenação, com `STUFF` para remover separador.

```sql
-- Exemplo extraído do PDF: Concatenar meios de comunicação separados por ' | '
SELECT
    p.Nr_cnpj_cpf,
    STUFF(
        (SELECT ' | ' + pmc.nm_meio_comunicacao
         FROM pessoa_meio_comunicacao pmc
         JOIN tp_meio_comunicacao tmc ON tmc.cd_tp_meio_comunicacao = pmc.cd_tp_meio_comunicacao
         WHERE tmc.cd_tp_meio_comunicacao IN (1,2,3)
           AND pmc.id_pessoa = p.id_pessoa
         ORDER BY pmc.nm_meio_comunicacao ASC
         FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 3, ''
    ) AS telefones
FROM pessoas p
WHERE p.id_pessoa IN (4703502, 5602786, 8130761, 8339477);
```

**Solução (DEPOIS):** Substituir por `STRING_AGG`, que é mais performático, legível e preserva caracteres.

```sql
SELECT
    p.Nr_cnpj_cpf,
    STRING_AGG(CAST(pmc.nm_meio_comunicacao AS VARCHAR(8000)), ' | ')
        WITHIN GROUP (ORDER BY pmc.nm_meio_comunicacao ASC) AS telefones
FROM pessoas p
JOIN pessoa_meio_comunicacao pmc ON pmc.id_pessoa = p.id_pessoa
JOIN tp_meio_comunicacao tmc ON tmc.cd_tp_meio_comunicacao = pmc.cd_tp_meio_comunicacao
WHERE tmc.cd_tp_meio_comunicacao IN (1, 2, 3)
  AND pmc.nm_meio_comunicacao IS NOT NULL
  AND p.id_pessoa IN (4703502, 5602786, 8130761, 8339477, 8339944, 8342505, 8447643, 8495170, 9531716, 9562016)
GROUP BY p.id_pessoa, p.Nr_cnpj_cpf;
```

**Motivo:** O `FOR XML PATH` foi a solução padrão por muitos anos, mas ele tem custos ocultos:

- **Performance:** A geração de XML é mais pesada que a agregação direta de strings.
- **Distorção de caracteres:** Caracteres especiais como `&` viram `&amp;`, `<` viram `&lt;` etc., exigindo `REPLACE` adicional para corrigir.
- **Legibilidade:** A combinação de `STUFF`, `FOR XML PATH`, `TYPE` e `.value()` é confusa e difícil de dar manutenção.

`STRING_AGG` resolve todos esses problemas: é otimizada internamente para concatenação, mantém o texto original e tem uma sintaxe clara.

## Recomendação

- **Sempre** que possível, use `STRING_AGG` em vez de `FOR XML PATH` para concatenações.
- **Atenção ao tamanho:** Para colunas `VARCHAR(MAX)`, use `CAST(expressão AS VARCHAR(8000))` ou `VARCHAR(MAX)` para evitar estouro ou truncamento inesperado.
- **Monitore Memory Grant:** O `STRING_AGG` com `WITHIN GROUP (ORDER BY ...)` pode exigir memória extra para ordenação. Se a consulta for muito pesada e causar *spills*, considere:
  - Remover a ordenação se não for estritamente necessária.
  - Ou voltar ao `FOR XML PATH` (embora seja uma exceção, não a regra).
- **Verifique a versão:** `STRING_AGG` está disponível a partir do SQL Server 2017 (nível de compatibilidade 140) e no Azure SQL Database. Se o ambiente for anterior, mantenha `FOR XML PATH`.

---
**⚠️ Importante:** O `STRING_AGG` não substitui automaticamente o `FOR XML PATH` em todos os cenários. Se você estiver gerando XML real ou precisar de funcionalidades específicas do XML (como hierarquia), mantenha a abordagem original. Para concatenação pura de strings, `STRING_AGG` é a escolha superior.