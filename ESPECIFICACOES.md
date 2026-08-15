# MANUAL DE ESPECIFICAÇÃO TÉCNICA – AGENTE DE TUNING SQL SERVER (VERSÃO COMPLETA)

**Stack:** Node.js (Backend) + React (Frontend) + MongoDB (Armazenamento) + LLM DeepSeek (API gratuita)

---

## 1. PREMISSAS FUNDAMENTAIS

- **LLM (DeepSeek):** O motor de inferência é a API gratuita da DeepSeek, compatível com o formato OpenAI (mensagens e `tools` / `function calling`). O sistema deve respeitar os limites de taxa e gerenciar o contexto de forma eficiente.
- **Segurança:** O agente nunca possui string de conexão com o banco SQL Server. Toda extração de dados é feita via scripts T-SQL gerados e executados manualmente pelo usuário.
- **Neutralidade de Implementação:** Este documento define **o que** o sistema deve fazer e **como** os componentes se relacionam, mas não prescreve a implementação interna (código). O desenvolvedor tem liberdade para escolher bibliotecas, padrões de projeto e estruturas internas, desde que respeite os contratos e fluxos descritos.
- **Evolução Dinâmica de Dados:** Os modelos de dados podem ser alterados em tempo real, e o sistema deve aplicar migrações automáticas para atualizar os documentos existentes.

---

## 2. GLOSSÁRIO CONCEITUAL

| Termo | Definição |
| :--- | :--- |
| **Agente** | Entidade lógica que gerencia a sessão do usuário, mantém o histórico e coordena a interação entre Frontend, Harness e LLM. |
| **Harness (Orquestrador)** | Motor de execução principal. Implementa a máquina de estados da conversa, gerencia cache, pausas e chamadas à LLM. |
| **Tool (Ferramenta de Coleta)** | Módulo atômico e sem estado que gera um script T-SQL específico, valida a resposta do usuário e a transforma em JSON estruturado. |
| **Skill (Habilidade de Diagnóstico)** | Módulo com estado interno que encapsula uma regra de negócio (ex: detectar `SELECT *`). Pode solicitar Tools, processar dados e gerar recomendações. Seu estado é mantido no cache da sessão. |
| **Skill Factory** | Meta-skill responsável por criar novas skills de diagnóstico a partir de técnicas manuais relatadas pelo usuário. Conduz uma entrevista estruturada e gera um novo módulo de skill, que é registrado na biblioteca dinâmica de skills. |
| **Cache de Sessão (Memória)** | Armazenamento volátil (RAM) que guarda dados fornecidos e estados das Skills durante a sessão ativa. |
| **Repositório de Fatos (MongoDB)** | Armazenamento persistente de resultados de Tools (`facts_cache`) e da biblioteca de Skills (`skills_library`). |
| **Migração de Dados** | Processo automático que verifica a versão do esquema dos documentos no MongoDB e aplica transformações para atualizá-los para o formato mais recente. |

---

## 3. ARQUITETURA DOS COMPONENTES

**Backend (Node.js):**

- **Camada de API (Rotas Express):** Recebe requisições do Frontend, autentica sessões e direciona para o Agente.
- **Agente (Fachada):** Gerencia o ciclo de vida das sessões (criação, recuperação, encerramento). Mantém um mapa de sessões ativas.
- **Harness (Núcleo):** Contém o loop principal de inferência. Invoca a DeepSeek, gerencia o histórico, interage com o Cache e controla os estados da conversa.
- **Repositório de Tools:** Registro centralizado contendo todas as Tools de coleta disponíveis (ex: `get_execution_plan`).
- **Biblioteca de Skills:** Registro centralizado contendo:
  - Skills fixas (embutidas no código, ex: `ensure_fk_indexes`).
  - Skills dinâmicas (criadas pela Skill Factory), armazenadas no MongoDB.
  - A Skill Factory é também uma skill especial, registrada na biblioteca.
- **Gerenciador de Cache:** Camada única que busca primeiro no Cache de Sessão (RAM) e depois no Repositório de Fatos (MongoDB).
- **Serviço de Migração:** Executado na inicialização. Verifica a versão do esquema no MongoDB e aplica migrações pendentes em todas as coleções, incluindo a `skills_library`.

**Frontend (React):**

- **Gerenciador de Estado Global:** Mantém o estado da sessão (ID, status, mensagens, ferramenta pendente, sugestão final).
- **Camada de Serviços (API Client):** Gerencia requisições HTTP e polling de estado.
- **Componente de Chat:** Renderiza mensagens do usuário e do assistente (com suporte a Markdown).
- **Componente de Solicitação de Ferramenta:** Exibe script T-SQL, botão de cópia e área de texto para colar resultado.
- **Componente de Sugestão Final:** Renderiza a recomendação em Markdown.
- **Componente de Entrevista (Skill Factory):** Quando a Skill Factory é ativada, exibe perguntas sequenciais (com campos de entrada) para o usuário responder. O agente conduz a entrevista de forma interativa.

---

## 4. MODELAGEM DE DADOS E ESTRATÉGIA DE MIGRAÇÃO

**Coleções principais do MongoDB:**

- **`facts_cache`**: Armazena resultados das Tools.
  - Estrutura base: `{ _id, toolName, paramsHash, rawData (JSON), summary (opcional), createdAt, accessedAt }`.
- **`sessions`**: Armazena metadados das conversas.
  - Estrutura: `{ _id, sessionId, skillName, status, createdAt, updatedAt }`.
- **`skills_library`**: Armazena as skills dinâmicas criadas pela Skill Factory.
  - Estrutura: `{ _id, name, description, systemPrompt, toolsRequired (array de nomes), detectionRules (JSON), recommendationTemplate, createdAt, updatedAt }`.
  - As skills fixas (embutidas no código) não precisam estar nesta coleção, mas a Skill Factory pode gerar documentos que serão lidos pelo sistema para instanciar novas skills.
- **`migrations_control`**: Registra o histórico de migrações aplicadas.
  - Estrutura: `{ version, description, appliedAt }`.

**Estratégia de Evolução e Migração:**

1. O sistema mantém uma versão interna do esquema esperado para cada coleção.
2. Na inicialização, o sistema consulta `migrations_control` para obter a versão atual.
3. Se a versão atual for menor que a esperada, o sistema executa, em ordem, as migrações pendentes (scripts de transformação) sobre os documentos existentes.
4. Cada migração deve ser idempotente e preservar os dados. Exemplo: ao adicionar o campo `detectionRules` na coleção `skills_library`, a migração percorre todos os documentos existentes e adiciona um valor padrão.
5. Após a migração bem-sucedida, a nova versão é registrada.
6. As migrações são definidas como funções de transformação no código fonte, aplicadas à coleção alvo.

---

## 5. ESPECIFICAÇÃO FUNCIONAL DO HARNESS (MÁQUINA DE ESTADOS)

| Estado | Comportamento |
| :--- | :--- |
| **ÓCIO** | Aguardando mensagem inicial. |
| **PENSANDO** | Chamada à DeepSeek em andamento. |
| **AGUARDANDO DADO** | Ferramenta de coleta chamada, cache miss, script gerado. Sistema pausado aguardando entrada do usuário. |
| **VALIDANDO** | Usuário enviou resultado; validação e parseamento em andamento. |
| **DELIBERANDO** | Dado validado e salvo no cache; DeepSeek chamada novamente com novo contexto. |
| **CONCLUÍDO** | Resposta final obtida. |

**Regras Especiais:**
- Quando o usuário cola um comando DDL/DML (ex: `CREATE INDEX ...`) ou uma reescrita de consulta e relata melhoria, o Harness pode detectar essa ação (via análise do histórico) e, opcionalmente, sugerir a ativação da Skill Factory.
- A ativação da Skill Factory pode ser iniciada tanto pelo usuário (explicitamente) quanto pelo agente (quando percebe uma técnica não catalogada).

---

## 6. SPECIFICAÇÃO DA SKILL FACTORY (CRIAÇÃO DE NOVAS SKILLS)

### 6.1. Propósito

Permitir que o usuário ensine ao agente novas regras de tuning que não estão pré-programadas, transformando conhecimento tácito em uma skill reutilizável.

### 6.2. Gatilhos para Ativação

- **Usuário explícito:** O usuário digita algo como: *"Quero criar uma nova skill para detectar [nome da técnica]"*.
- **Detecção automática:** O agente percebe que o usuário aplicou uma correção manual (colou um comando DDL ou reescreveu uma consulta) e pergunta se ele gostaria de transformar essa solução em uma skill.

### 6.3. Fluxo de Entrevista Estruturada

Quando ativada, a Skill Factory inicia um diálogo guiado com o usuário, fazendo perguntas sequenciais. O conteúdo das perguntas é gerado dinamicamente pelo próprio LLM, mas segue um roteiro fixo:

1. **Nome da técnica:** *"Qual nome você daria a essa técnica de otimização?"*
2. **Gatilho (condição de disparo):** *"Em que situação essa técnica deve ser aplicada? (ex: presença de um operador no plano, um padrão no texto SQL, etc.)"*
3. **Dados necessários:** *"Quais informações você precisa coletar para diagnosticar esse problema? (ex: plano de execução, schema da tabela, estatísticas de IO)"*
4. **Recomendação típica:** *"Qual é a solução padrão que você sugere? (ex: reescrever a consulta usando EXISTS, criar um índice com INCLUDE, etc.)"*
5. **Script de verificação/correção (opcional):** *"Você tem um script SQL modelo para verificar ou corrigir esse problema?"*

### 6.4. Geração da Nova Skill

Com as respostas, a Skill Factory constrói um **documento de skill** que contém:

- `name`: nome fornecido.
- `description`: resumo da técnica.
- `systemPrompt`: um prompt inicial que orienta o LLM sobre como usar essa skill (gerado automaticamente com base nas respostas).
- `toolsRequired`: lista das Tools de coleta que a skill precisará (inferidas a partir dos "dados necessários").
- `detectionRules`: um objeto JSON (ou linguagem de padrões) que descreve como identificar a condição (gatilho) nos dados coletados.
- `recommendationTemplate`: um template de texto com placeholders para gerar a recomendação final.

Este documento é então salvo na coleção `skills_library` do MongoDB.

### 6.5. Integração com a Biblioteca de Skills

- O sistema, ao iniciar, carrega todas as skills da coleção `skills_library` e as registra como disponíveis para uso pelo Agente (juntamente com as skills fixas).
- Quando o usuário inicia uma nova conversa, ele pode escolher qualquer skill registrada (fixa ou dinâmica).
- As skills dinâmicas podem ser editadas ou desativadas pelo usuário (via interface administrativa, se implementada).

### 6.6. Impacto na Estrutura de Dados e Migração

- O documento da skill dinâmica pode evoluir com o tempo (novos campos). O sistema de migração deve estar preparado para atualizar esses documentos quando o esquema for alterado.
- As migrações podem adicionar campos como `version`, `tags`, `examples`, etc., sem perder as skills já criadas.

---

## 7. ESPECIFICAÇÃO DAS TOOLS E SKILLS (MÍNIMO VIÁVEL)

### 7.1. Tools de Coleta (fixas, embutidas)

- `get_execution_plan`
- `get_table_schema`
- `get_query_text`
- `get_wait_stats`
- `get_table_indexes`
- `get_table_statistics` – metadados de estatísticas (`sys.stats` + `sys.dm_db_stats_properties`)
- `get_foreign_keys` – chaves estrangeiras da tabela (filha/pai + colunas mapeadas)
- `get_object_metadata` – metadados de objetos (`sys.sql_modules`: `is_inlineable`, SCHEMABINDING, definição)

### 7.2. Skills de Diagnóstico (fixas, embutidas)

**Índices e operadores de acesso:**
- `create_assertive_index` – criação/melhoria objetiva de índices (pode ser acionada por handoff)
- `recommend_missing_index` – aproveita sugestões do otimizador (missing index)
- `key_lookup_elimination` – elimina Key Lookup com índice de cobertura
- `avoid_heap_table` – tabelas heap sem índice clustered
- `avoid_select_star` – evita `SELECT *`
- `avoid_varchar_max` – evita `VARCHAR(MAX)` quando o tamanho real é limitado
- `ensure_fk_indexes` – índices sobre colunas de chave estrangeira

**Predicados não-sargáveis e conversões:**
- `avoid_non_sargable_predicate` – função/aritmética na coluna do `WHERE`
- `avoid_wildcard_prefix` – `LIKE '%texto'` com curinga no início
- `detect_implicit_conversion` – conversão implícita na coluna (WHERE/JOIN)
- `avoid_isnull_in_where` – `ISNULL(coluna, valor)` no `WHERE`
- `avoid_dynamic_search_condition` – filtros opcionais (`@param IS NULL OR`)
- `avoid_not_in_with_nulls` – `NOT IN` com nulos
- `handle_nulls_in_aggregate_expressions` – nulos em expressões agregadas

**Reescrita de consultas (EXISTS/joins):**
- `replace_join_with_exists` – JOIN usado só para filtrar → `EXISTS`
- `replace_join_distinct_with_exists` – `JOIN + DISTINCT` → `EXISTS`
- `replace_left_join_isnull_with_not_exists` – anti-join (`LEFT JOIN ... IS NULL`) → `NOT EXISTS`
- `replace_subselect_with_join` – subconsulta correlacionada → `JOIN`
- `replace_or_between_columns_with_union_all` – `OR` entre colunas → `UNION ALL`
- `set_based_instead_of_cursor` – cursor/WHILE → operações set-based
- `use_join_in_delete_update` – `DELETE`/`UPDATE` com `JOIN` (sintaxe SQL Server)
- `consolidate_multiple_updates_with_case` – múltiplos UPDATEs na mesma tabela → um `UPDATE` com `CASE`
- `encapsulate_case_with_correlated_subquery` – `CASE (SELECT ...)` → subconsulta encapsulada
- `optimize_repetitive_case_with_cross_apply` – `CASE` repetido no SELECT/WHERE → `CROSS APPLY`
- `use_apply_for_multiple_aggregates` – múltiplas subconsultas agregadas → `OUTER APPLY`
- `extract_fixed_subquery_to_variable` – subconsulta fixa repetida → variável
- `choose_temp_table_or_table_variable` – escolha entre `@tabela` e `#tabela`
- `avoid_large_temp_tables` – temporárias grandes/`SELECT * INTO #Temp`
- `cache_string_split_with_temp_table` – `STRING_SPLIT` repetido → cache em temporária

**Funções de janela (window functions):**
- `use_aggregate_over_partition` – agregado por grupo → `SUM() OVER (PARTITION BY)`
- `use_row_number_for_top_n_per_group` – "top N por grupo" → `ROW_NUMBER()`
- `use_rank_functions_for_numbering` – numeração manual → `RANK()`/`DENSE_RANK()`/`ROW_NUMBER()`
- `use_lag_for_previous_row` – linha anterior → `LAG()`
- `use_lead_for_next_row` – linha seguinte → `LEAD()`
- `use_sum_over_for_running_total` – total acumulado → `SUM() OVER (ROWS UNBOUNDED PRECEDING)`
- `use_window_functions_for_sliding_window` – médias móveis/janelas deslizantes → `ROWS BETWEEN`

**Ordenação:**
- `always_use_order_by_for_guaranteed_order` – adiciona `ORDER BY` quando a ordem importa
- `avoid_unnecessary_order_by` – remove `ORDER BY` desnecessário (ordenação na aplicação)

**DML e transações:**
- `use_output_clause_for_atomic_operations` – captura dados modificados com `OUTPUT`
- `avoid_unnecessary_foreign_key_updates` – evita `UPDATE` desnecessário de colunas FK
- `optimize_long_running_transaction` – transações longas e bloqueios

**Plano de execução, estatísticas e UDFs:**
- `refresh_stale_statistics` – estatísticas desatualizadas
- `handle_parameter_sniffing` – parameter sniffing (`OPTION (RECOMPILE)`, `OPTIMIZE FOR`)
- `avoid_row_goal_in_exists` – row goal no `EXISTS` (`TOP`/`ORDER BY` na subconsulta)
- `avoid_multiple_table_scans_with_case` – múltiplas leituras da mesma tabela → `CASE`
- `ensure_scalar_udf_inlining` – habilita inlining de scalar UDFs
- `prefer_string_agg_over_for_xml` – concatenação com `FOR XML PATH` → `STRING_AGG`
- `prefer_union_all_over_union` – `UNION` sem necessidade de eliminar duplicatas → `UNION ALL`

**Genérica:**
- `general_tuning` – diagnóstico amplo quando nenhuma técnica específica se aplica

### 7.3. Skill Factory (meta-skill especial)

- Sempre disponível, pode ser invocada pelo usuário ou sugerida pelo agente.

---

## 8. ESPECIFICAÇÃO DA API

- **POST `/api/session/start`**: Inicia sessão com uma skill específica (incluindo a Skill Factory).
- **POST `/api/agent/act`**: Envia mensagem do usuário.
- **GET `/api/agent/state/:sessionId`**: Retorna o estado atual (incluindo, se for o caso, a pergunta atual da entrevista da Skill Factory).
- **POST `/api/agent/feedback`**: Envia resultado de ferramenta ou resposta a uma pergunta da entrevista (campo `userResult` pode conter a resposta do usuário à pergunta da Skill Factory).
- **POST `/api/skills/create`** (opcional, pode ser integrado ao fluxo de `act`): Permite salvar uma nova skill gerada. Normalmente, a Skill Factory já faz isso internamente.
- **GET `/api/skills`**: Lista as skills disponíveis (fixas e dinâmicas habilitadas).
- **GET `/api/health`**: Health check da API.

---

## 9. ESPECIFICAÇÃO DO FRONTEND

O Frontend deve ser capaz de renderizar:

- **Modo Chat padrão:** mensagens e sugestões.
- **Modo Coleta:** script SQL + área de colagem.
- **Modo Entrevista:** quando a Skill Factory está ativa, exibe perguntas sequenciais com campos de texto para resposta, e o botão "Próximo" ou "Enviar resposta". O agente controla o fluxo, mas a UI deve ser adaptável para exibir perguntas e coletar respostas.

O estado `pendingTool` pode ser estendido para incluir `interviewQuestion` quando a Skill Factory estiver em andamento.

---

## 10. FLUXO DE INTERAÇÃO COM SKILL FACTORY (EXEMPLO)

1. **Usuário:** "Minha query está lenta, mas eu resolvi criando um índice filtrado. Quero criar uma skill para detectar quando isso é útil."
2. **Agente** (via Harness) ativa a Skill Factory.
3. **Skill Factory** faz a primeira pergunta: "Qual nome você daria a essa técnica?"
4. **Usuário** responde: "índice filtrado para valores nulos".
5. **Skill Factory** pergunta: "Qual o gatilho? (ex: presença de coluna com muitos NULLs no WHERE?)"
6. **Usuário** responde: "Quando a condição WHERE usa IS NULL ou IS NOT NULL em uma coluna com alta seletividade."
7. **Skill Factory** pergunta: "Quais dados você precisa coletar para diagnosticar? (ex: plano, schema?)"
8. **Usuário** responde: "O plano de execução e o schema da tabela."
9. **Skill Factory** pergunta: "Qual é a recomendação típica?"
10. **Usuário** responde: "Criar um índice filtrado com a condição WHERE coluna IS NULL."
11. **Skill Factory** pergunta: "Tem um script modelo para verificar a necessidade?"
12. **Usuário** fornece ou diz que não.
13. **Skill Factory** gera o documento da nova skill, salva no MongoDB e informa: "Skill criada com sucesso. Você pode usá-la em novas conversas."

---

## 11. CONFIGURAÇÃO DE AMBIENTE

Variáveis de ambiente:

- `PORT` — porta da API (padrão `3001`)
- `DEEPSEEK_API_KEY` — chave da API (OpenRouter ou DeepSeek oficial)
- `DEEPSEEK_BASE_URL` — Base URL (padrão `https://openrouter.ai/api/v1`; alternativa oficial `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` — modelo de inferência (padrão do `.env.example`: `deepseek/deepseek-v4-flash-0731`)
- `MONGODB_URI` — URI do MongoDB (padrão `mongodb://127.0.0.1:27017/tuning_agent`)
- `MONGODB_MEMORY_FALLBACK` — usa MongoDB embutido em memória se a URI não conectar (padrão `true`)
- `MAX_CONTEXT_TOKENS` — limite de tokens do contexto do agente (padrão `12000`)
- `LLM_TIMEOUT_MS` — timeout da chamada à LLM em ms (padrão `120000`)
- `LLM_MOCK` — `true` apenas para testes locais sem API; padrão `false`

---

## 12. ROTEIRO DE IMPLEMENTAÇÃO SUGERIDO

1. Setup do monorepo e conexão com MongoDB.
2. Camada de Cache e Serviço de Migração.
3. Harness básico (máquina de estados).
4. Tools de coleta.
5. Integração com DeepSeek (function calling).
6. Skills fixas (diagnóstico).
7. **Skill Factory**: implementar a meta-skill, a lógica de entrevista, a geração do documento e o salvamento no MongoDB.
8. Frontend: componentes para chat, coleta e entrevista.
9. Polling e integração API.
10. Testes e validação (incluindo criação de nova skill e uso em nova sessão).

---

Este manual agora contém **todas** as funcionalidades discutidas, incluindo a Skill Factory, com todas as especificações necessárias para que um desenvolvedor construa o sistema do zero, respeitando os ajustes solicitados.
