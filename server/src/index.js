import { buildApp } from './composition-root.js';

const { app, config, close } = await buildApp();

const server = app.listen(config.port, () => {
  console.log(`[tuning-agent] API rodando em http://localhost:${config.port}`);
});

async function shutdown() {
  console.log('[tuning-agent] Encerrando...');
  server.close(async () => {
    await close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
