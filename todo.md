# TunigAgent - Roadmap de Melhorias

## FASE 1 - Massa de Testes e Qualidade

~~1 - Testes para cobrir as regras de negócio das skills~~ (concluído: 48 de 48 skills fixas com diagnóstico ANTES/DEPOIS, scripts SQL e recomendações acionáveis validadas)
~~2 - Teste de cobertura para todos os pontos do harness~~ (concluído: 98% de linhas globais, branches de harness, prompt-builder, data-change, handoff, agent-facade, matcher, llm-client e get-skill-details cobertas)
~~3 - Testes para a Skill Factory (entrevista, geração de documento e registro)~~ (concluído: entrevista guiada, geração de documento, registro, carregamento)
~~4 - Testes de roteamento e regressão: query complexa E2E, regressão por skill para todas as 48 skills + general_tuning e sanidade do matcher~~ (concluído: 48 casos canônicos completos)

### lacunas pendentes (prioridade alta) - TODAS CONCLUÍDAS

~~1 - Regressão por skill: canonical para as 48 skills fixas + general_tuning com mensagens, dados e recomendações esperadas~~
~~2 - Regras de negócio por skill: parser aprimorado e teste dedicado validando ANTES/DEPOIS, scripts e recomendações das 48 habilidades fixas~~
~~3 - Cobertura do harness: branches complementadas (agent-facade: 100%, prompt-builder: 100%, data-change-detector: 100%, skill-handoff-detector: 100%, get-skill-details: 100%, skill-matcher: 100% linhas, llm-client: 100% linhas)~~
~~4 - Script de coverage no CI: adicionado `test:coverage` no package.json raiz e etapa no .github/workflows/ci.yml~~

## FASE 2 - Infraestrutura de Entrada

5 - Configurar/trocar a LLM pela interface (ex: DeepSeek <-> Copilot) sem deploy
6 - Upload de arquivos de entrada: SQL (queries/stored procedures) e XML/sqlplan (planos de execução)

## FASE 3 - Sessões e Relatórios

7 - Histórico e painel web de sessões: listar, retomar, excluir e exportar análises, com persistência em SQLite para retomar após restart do servidor
8 - Gerar relatório final em Markdown/PDF com as recomendações de cada sessão (download)
9 - Estimativa de impacto de cada recomendação (redução estimada de I/O, CPU e tempo)
10 - Análise de stored procedures inteiras decompondo cada statement para a skill adequada

## FASE 4 - Transparência e Calibração do Agente

11 - Explicação "Por que essa skill?" + comparação de recomendações entre skills diferentes para a mesma query
12 - Feedback de satisfação por recomendação (gostei/não gostei) para calibrar o matcher + índice de qualidade das skills (% de recomendações aceitas)
13 - Visualizar e editar a skill ativa em tempo real (instruções + tools) sem reiniciar o servidor

## FASE 5 - Conhecimento e Produtividade

14 - Catálogo de skills navegável (ANTES/DEPOIS, keywords, tools) + biblioteca de queries de exemplo agrupadas por problema

## FASE FINAL - Refinamentos de UI/UX

- Tema claro/escuro com alternância suave e persistência de preferência
- Animações de transição entre estados da sessão (PENSANDO -> AGUARDANDO DADO...) para clareza de progresso
- Skeletons de carregamento nos painéis (sessões, catálogo, relatórios) em vez de spinners
- História da conversa em árvore colapsável: agrupar tool chamada + resultado em um nó recolhível
- Botão "copiar script" com feedback visual (ícone de check) ao copiar o T-SQL
- Formatação syntax-highlight de SQL dentro das mensagens e dos scripts solicitados
- Indicador "a skill ativa" persistente no topo do chat, mostrando qual técnica está sendo aplicada
- Progresso da entrevista da Skill Factory com barra de etapas (1/5, 2/5...)
- Diff visual do SQL ANTES/DEPOIS nas recomendações, destacando as linhas alteradas
- Empty states ilustrados: guia inicial para quem nunca usou o agente antes
- Tooltips explicativos em cada tool/skill do catálogo (o que faz e quando usar)
- Modo foco: esconder painéis laterais para concentrar no diagnóstico atual
- Placeholder inteligente no input adivinhando como descrever o problema
- Histórico local de queries digitadas com sugestão ao digitar (como um assistente de preenchimento)
- Microinterações de feedback (confirmação ao excluir sessão, ao registrar feedback gostei/não gostei)
