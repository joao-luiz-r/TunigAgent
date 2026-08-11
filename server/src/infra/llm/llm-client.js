import { MockLlm } from './mock-llm.js';

export class DeepSeekClient {
  constructor({ apiKey, baseUrl, model, timeoutMs, fetchImpl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  async createChatCompletion({ system, messages, tools }) {
    const body = { model: this.model, messages: [], stream: false };
    if (system) body.messages.push({ role: 'system', content: system });
    body.messages.push(...messages);
    if (tools && tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 300)}`);
      }
      const data = await response.json();
      const message = data.choices && data.choices[0] && data.choices[0].message;
      if (!message) throw new Error('DeepSeek retornou resposta vazia');
      return message;
    } finally {
      clearTimeout(timer);
    }
  }

  async chatJson({ system, messages }) {
    const message = await this.createChatCompletion({ system, messages });
    return extractJson(message.content || '');
  }
}

export function extractJson(content) {
  let text = String(content).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Resposta da LLM não contém JSON');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function createLlmClient(config) {
  if (config.mockLlm) {
    console.warn('[tuning-agent] LLM_MOCK=true. Usando LLM local de demonstração (desative para produção).');
    return new MockLlm();
  }
  if (!config.deepseekApiKey) {
    throw new Error('DEEPSEEK_API_KEY não configurada. Configure a chave no arquivo server/.env (use LLM_MOCK=true apenas para testes).');
  }
  return new DeepSeekClient({
    apiKey: config.deepseekApiKey,
    baseUrl: config.deepseekBaseUrl,
    model: config.deepseekModel,
    timeoutMs: config.llmTimeoutMs,
  });
}
