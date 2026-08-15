# TunigAgent - Roadmap de Melhorias

## FASE 1 - Massa de Testes e Qualidade

1 - Testes para cobrir as regras de negócio das skills
2 - Teste de cobertura para todos os pontos do harness
3 - Testes para a Skill Factory (entrevista, geração de documento e registro)
4 - Testes de roteamento e regressão: query complexa E2E, regressão por skill (query canônica -> recomendação esperada) e sanidade do matcher (mensagens ambíguas não podem escolher skill errada)

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
