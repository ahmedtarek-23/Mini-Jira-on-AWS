import { Router } from 'express';
import { TableNames, putItem, scanItems } from '../db.js';
import { requireRole } from '../auth.js';
const router = Router();
router.get('/', async (_req, res) => {
    const projects = await scanItems(TableNames.Projects);
    res.json(projects);
});
router.post('/', requireRole('manager'), async (req, res) => {
    const { name, description } = req.body;
    const project = {
        id: crypto.randomUUID(),
        name,
        description: description || '',
        createdBy: req.user.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await putItem(TableNames.Projects, project);
    res.status(201).json(project);
});
export default router;
//# sourceMappingURL=projects.js.map