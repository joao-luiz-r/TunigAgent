import { Router } from 'express';
import { agentController } from '../controllers/agent.controller.js';

export function agentRoutes(context) {
  const router = Router();
  const controller = agentController(context);
  router.post('/act', controller.act);
  router.post('/feedback', controller.feedback);
  router.get('/state/:sessionId', controller.state);
  return router;
}
