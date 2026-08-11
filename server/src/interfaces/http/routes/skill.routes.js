import { Router } from 'express';
import { skillController } from '../controllers/skill.controller.js';

export function skillRoutes(context) {
  const router = Router();
  const controller = skillController(context);
  router.get('/', controller.list);
  router.post('/create', controller.create);
  return router;
}
