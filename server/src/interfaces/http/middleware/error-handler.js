export function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Rota não encontrada' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`[tuning-agent] Erro não tratado: ${error.stack || error.message}`);
  }
  res.status(statusCode).json({ error: statusCode >= 500 ? 'Erro interno do servidor' : error.message });
}
