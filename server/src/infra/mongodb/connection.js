import { MongoClient } from 'mongodb';

const SERVER_SELECTION_TIMEOUT_MS = 4000;
const MEMORY_SERVER_STARTUP_TIMEOUT_MS = 30000;

let client = null;
let memoryServer = null;

export async function connectDatabase(uri, { memoryFallback = false } = {}) {
  if (client) return client.db();
  const mongo = new MongoClient(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: 10000,
  });
  try {
    await mongo.connect();
    client = mongo;
    return mongo.db();
  } catch (error) {
    await mongo.close().catch(() => {});
    if (!memoryFallback) throw error;
    console.warn(
      `[tuning-agent] Não foi possível conectar em ${uri} (${error.message}). Iniciando MongoDB embutido em memória...`,
    );
    return startMemoryDatabase();
  }
}

async function startMemoryDatabase() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await withTimeout(
    MongoMemoryServer.create(),
    MEMORY_SERVER_STARTUP_TIMEOUT_MS,
    `Inicialização do MongoDB em memória excedeu o limite de ${MEMORY_SERVER_STARTUP_TIMEOUT_MS}ms (download do binário mongod pode estar lento ou sem rede).`,
  );
  const memoryUri = memoryServer.getUri();
  const mongo = new MongoClient(memoryUri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: 10000,
  });
  await mongo.connect();
  client = mongo;
  console.log(`[tuning-agent] MongoDB em memória ativo em ${memoryUri}`);
  return mongo.db();
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      if (timer.unref) timer.unref();
    }),
  ]);
}

export function closeDatabase() {
  const pendingClient = client;
  const pendingServer = memoryServer;
  client = null;
  memoryServer = null;
  const closeClient = pendingClient ? pendingClient.close() : Promise.resolve();
  const closeServer = pendingServer ? pendingServer.stop() : Promise.resolve();
  return Promise.all([closeClient, closeServer]).then(() => undefined);
}
