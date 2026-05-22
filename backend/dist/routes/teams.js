import { Router } from 'express';
import { TableNames, putItem, scanItems } from '../db.js';
import { requireRole } from '../auth.js';
const router = Router();
router.get('/', async (_req, res) => {
    const teams = await scanItems(TableNames.Teams);
    res.json(teams);
});
router.post('/', requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    const team = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    await putItem(TableNames.Teams, team);
    res.status(201).json(team);
});
export default router;
//# sourceMappingURL=teams.js.map