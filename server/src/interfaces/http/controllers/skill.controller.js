import { wrap } from '../middleware/error-handler.js';

export function skillController({ facade }) {
  return {
    list: wrap(async (req, res) => {
      res.json(facade.listSkills());
    }),
    create: wrap(async (req, res) => {
      const skill = await facade.createSkill(req.body);
      res.status(201).json(skill);
    }),
  };
}
