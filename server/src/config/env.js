import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(thisDir, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, 'server', '.env') });

export function loadConfig() {
  return {
    port: Number(process.env.PORT || 3001),
    mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuning_agent',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    maxContextTokens: Number(process.env.MAX_CONTEXT_TOKENS || 12000),
    llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 120000),
    mockLlm: process.env.LLM_MOCK === 'true',
    mongoMemoryFallback: process.env.MONGODB_MEMORY_FALLBACK !== 'false',
  };
}
