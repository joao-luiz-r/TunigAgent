import { wrap } from '../middleware/error-handler.js';

export function sessionController({ facade }) {
  return {
    start: wrap(async (req, res) => {
      const state = await facade.startSession(req.body && req.body.skillName);
      res.status(201).json(state);
    }),
  };
}
