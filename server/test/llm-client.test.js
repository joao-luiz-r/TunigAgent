import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekClient, extractJson, createLlmClient } from '../src/infra/llm/llm-client.js';

function stubFetch(captured) {
  return async (url, options) => {
    captured.body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    };
  };
}

test('transporte adiciona estímulo quando payload termina em assistant (Gemini-safe)', async () => {
  const captured = {};
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: stubFetch(captured),
  });
  await client.createChatCompletion({
    system: 'sys',
    messages: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'parcial' }],
  });
  const roles = captured.body.messages.map((message) => message.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  assert.match(captured.body.messages[3].content, /Continue a análise/);
});

test('transporte não altera payload que já termina em usuário/tool', async () => {
  const captured = {};
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: stubFetch(captured),
  });
  await client.createChatCompletion({
    messages: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: null, tool_calls: [] },
      { role: 'tool', tool_call_id: '1', content: '{}' },
    ],
  });
  const roles = captured.body.messages.map((message) => message.role);
  assert.deepEqual(roles, ['user', 'assistant', 'tool']);
});

test('createChatCompletion envia tools e tool_choice quando fornecidas', async () => {
  const captured = {};
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x/',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: stubFetch(captured),
  });
  const tools = [{ type: 'function', function: { name: 'get_query_text', description: 'desc' } }];
  await client.createChatCompletion({
    messages: [{ role: 'user', content: 'analise' }],
    tools,
  });
  assert.deepEqual(captured.body.tools, tools);
  assert.equal(captured.body.tool_choice, 'auto');
});

test('createChatCompletion trata erro HTTP da API DeepSeek', async () => {
  const failingFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: failingFetch,
  });
  await assert.rejects(
    () => client.createChatCompletion({ messages: [{ role: 'user', content: 'teste' }] }),
    /DeepSeek API 500: Internal Server Error/,
  );
});

test('createChatCompletion rejeita resposta vazia da API', async () => {
  const emptyFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [] }),
  });
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: emptyFetch,
  });
  await assert.rejects(
    () => client.createChatCompletion({ messages: [{ role: 'user', content: 'teste' }] }),
    /retornou resposta vazia/,
  );
});

test('extractJson extrai blocos de código ```json e json puro, e lança se ausente', () => {
  assert.deepEqual(extractJson('```json\n{"chave": "valor"}\n```'), { chave: 'valor' });
  assert.deepEqual(extractJson('resultado aqui: {"num": 42} fim'), { num: 42 });
  assert.throws(() => extractJson('nenhum json aqui'), /Resposta da LLM não contém JSON/);
});

test('chatJson executa e parseia resposta em JSON', async () => {
  const jsonFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '```json\n{"sucesso": true}\n```' } }] }),
  });
  const client = new DeepSeekClient({
    apiKey: 'k',
    baseUrl: 'https://x',
    model: 'm',
    timeoutMs: 5000,
    fetchImpl: jsonFetch,
  });
  const result = await client.chatJson({ messages: [{ role: 'user', content: 'gere json' }] });
  assert.deepEqual(result, { sucesso: true });
});

test('createLlmClient instancia MockLlm ou DeepSeekClient conforme config', () => {
  // mockLlm = true
  const mock = createLlmClient({ mockLlm: true });
  assert.equal(mock.constructor.name, 'MockLlm');

  // mockLlm = false mas sem chave de API
  assert.throws(() => createLlmClient({ mockLlm: false }), /DEEPSEEK_API_KEY não configurada/);

  // mockLlm = false com chave configurada
  const real = createLlmClient({
    mockLlm: false,
    deepseekApiKey: 'chave_secreta',
    deepseekBaseUrl: 'https://api.deepseek.com',
    deepseekModel: 'deepseek-chat',
    llmTimeoutMs: 30000,
  });
  assert.equal(real.constructor.name, 'DeepSeekClient');
  assert.equal(real.model, 'deepseek-chat');
});
