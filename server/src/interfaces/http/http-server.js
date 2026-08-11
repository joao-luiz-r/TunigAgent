import express from 'express';
import { sessionRoutes } from './routes/session.routes.js';
import { agentRoutes } from './routes/agent.routes.js';
import { skillRoutes } from './routes/skill.routes.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export function createHttpServer({ facade }) {
  const app = express();
  const context = { facade };

  app.disable('x-powered-by');
  app.use(corsMiddleware());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.use('/api/session', sessionRoutes(context));
  app.use('/api/agent', agentRoutes(context));
  app.use('/api/skill', skillRoutes(context));
  app.use('/api/skills', skillRoutes(context));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
