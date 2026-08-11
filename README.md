# Agente de Tuning SQL Server

Agente de diagnóstico e tuning de SQL Server alimentado por LLM (DeepSeek). Coleta dados via scripts T-SQL executados manualmente pelo usuário (o agente nunca se conecta ao banco), diagnostica com skills fixas e dinâmicas, e permite ao usuário ensinar novas técnicas através da Skill Factory.

**Stack:** Node.js (backend) + React (frontend) + MongoDB + DeepSeek LLM (via OpenRouter).

## Requisitos

- Node.js 18+
- MongoDB local ou remoto (URI em `MONGODB_URI`) — opcional: sem MongoDB, o sistema usa um MongoDB embutido em memória automaticamente
- Chave de API OpenRouter (obrigatória — sem chave o backend não inicia, a menos que `LLM_MOCK=true`)

## Estrutura

```
server/   Backend Node.js (Express + MongoDB + DeepSeek)
client/   Frontend React (Vite)
ESPECIFICACOES.md  Manual de especificação técnica completo
```

## Configuração

1. Instale as dependências na raiz: `npm install`
2. Copie `server/.env.example` para `server/.env` e preencha as variáveis:

| Variável | Descrição |
| :--- | :--- |
| `PORT` | Porta da API (padrão 3001) |
| `DEEPSEEK_API_KEY` | Chave da API OpenRouter (obrigatória; header `Authorization: Bearer`) |
| `DEEPSEEK_BASE_URL` | Base URL (padrão https://openrouter.ai/api/v1) |
| `DEEPSEEK_MODEL` | Modelo (padrão deepseek/deepseek-v4-flash-0731) |
| `MONGODB_URI` | URI do MongoDB (padrão mongodb://127.0.0.1:27017/tuning_agent) |
| `MONGODB_MEMORY_FALLBACK` | Usa MongoDB embutido em memória se a URI não conectar (padrão true) |
| `LLM_MOCK` | `true` apenas para testes locais sem API; padrão `false` (LLM real obrigatório) |

## Execução

- Backend: `npm run dev:server` (ou `npm run start`)
- Frontend: `npm run dev:client` (http://localhost:5173, proxy `/api` para a API)
- Testes: `npm test` (Node.js `node:test`, sem dependências externas)

## Endpoints

- `POST /api/session/start` — inicia sessão com uma skill
- `POST /api/agent/act` — envia mensagem do usuário
- `GET /api/agent/state/:sessionId` — estado atual da sessão
- `POST /api/agent/feedback` — envia resultado de ferramenta ou resposta de entrevista
- `GET /api/skills` — lista skills disponíveis
- `POST /api/skill/create` — cria skill diretamente (uso administrativo)

## Fluxo

O Harness implementa a máquina de estados (ÓCIO → PENSANDO → AGUARDANDO DADO → VALIDANDO → DELIBERANDO → CONCLUÍDO). Quando uma skill solicita uma Tool de coleta, o sistema gera um script T-SQL para o usuário executar no SSMS e colar o resultado. Resultados são cacheados por sessão e no MongoDB (`facts_cache`). A Skill Factory conduz uma entrevista guiada e gera novas skills persistidas em `skills_library`, com migrações automáticas aplicadas na inicialização.
