import { wrap } from '../middleware/error-handler.js';

export function agentController({ facade }) {
  return {
    act: wrap(async (req, res) => {
      const { sessionId, message } = req.body || {};
      const state = await facade.act(sessionId, message);
      res.json(state);
    }),
    feedback: wrap(async (req, res) => {
      const { sessionId, userResult } = req.body || {};
      const state = await facade.feedback(sessionId, userResult);
      res.json(state);
    }),
    state: wrap(async (req, res) => {
      const state = await facade.getState(req.params.sessionId);
      res.json(state);
    }),
  };
}
