import { Router } from 'express';
import { sessionController } from '../controllers/session.controller.js';

export function sessionRoutes(context) {
  const router = Router();
  const controller = sessionController(context);
  router.post('/start', controller.start);
  return router;
}
