# Diretrizes de Desenvolvimento - Backend (server)

Regras específicas para desenvolvimento, manutenção e testes da camada de backend do TunigAgent.

---

## 🏛️ Arquitetura e Padrões
- **Módulos:** Node.js Nativo com ECMAScript Modules (`"type": "module"`). Não utilize `require()`.
- **Clean Architecture:**
  - `src/domain/`: Entidades (`Session`, `Skill`, `Tool`) e enums de estado puros sem dependências de infraestrutura.
  - `src/application/`: Casos de uso, Harness, Skill Factory, Skill Loader/Catalog, Analyzers e Tools.
  - `src/infra/`: Adaptadores externos (MongoDB, MockLLM, DeepSeekClient, ContextManager, Cache).
  - `src/composition-root.js`: Injeção de dependência e inicialização unificada.

---

## 🧠 Motor de Diagnóstico & Harness (Domínio do Produto)
1. **Catálogo Sob Demanda:** O Harness utiliza `buildCompactSkillCatalog()` no system prompt inicial e resolve detalhes completos sob demanda através da tool interna `get_skill_details`. Não injete o manual completo de 48 skills no system prompt.
2. **Formato das Skills do Produto:** Cada skill é um arquivo `.skill.md` em `src/application/skills/fixed/` com YAML frontmatter válido (`name`, `description`, `trigger`, `difficulty`, `tags`) e seções obrigatórias (`DIAGNÓSTICO`, `SCRIPT DE COLETA`, `SCRIPT ANTES / DEPOIS`, `RECOMENDAÇÃO ACIONÁVEL`).
3. **Tools de Coleta T-SQL:** Em `src/application/tools/`, geram scripts T-SQL sanitizados para execução manual do usuário e convertem o retorno tabular em JSON estruturado.
4. **Skill Factory:** Mantém entrevista guiada em 5 etapas (`INTERVIEW_STEPS`), permitindo fallback determinístico e registro de skills dinâmicas sem reiniciar o servidor.
5. **LLM Abstraction:** Toda comunicação com modelos passa por `createLlmClient()`. Testes automatizados DEVEM rodar com `LLM_MOCK=true` e zero dependência de rede externa.

---

## 🧪 Padrões de Testes & Qualidade
- **Executor:** Test runner nativo do Node.js (`node --test`).
- **Cobertura:** Manter cobertura global de linhas acima de **98%** (`npm run test:coverage`).
- **Regressão Canônica:** Qualquer alteração em `skill-matcher.js` ou `harness.js` deve passar com 100% de sucesso nos 48 casos canônicos de `server/test/routing-regression.test.js`.
- **Regras de Negócio:** Todas as 48 skills fixas devem passar na validação de diagnóstico e scripts em `server/test/skills-business-rules.test.js`.

---

## 🔒 Segurança de Dados
- **Sanitização de Identificadores:** Toda tool de coleta deve sanitizar nomes de tabelas, schemas e bancos usando helpers como `safeIdentifier`.
- **Zero SQL Direto:** Nenhuma rota ou serviço pode executar queries diretamente contra o banco de dados do usuário.
