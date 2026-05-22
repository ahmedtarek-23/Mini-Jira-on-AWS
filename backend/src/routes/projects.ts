import { Router } from 'express';
import crypto from 'node:crypto';
import { TableNames, putItem, scanItems, updateItem, deleteItem } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  const projects = await scanItems(TableNames.Projects);
  res.json(projects);
});

router.post('/', requireRole('manager'), async (req, res) => {
  const { name, description } = req.body;
  const projectId = crypto.randomUUID();
  const project = {
    projectId,
    id: projectId,
    name,
    description: description || '',
    createdBy: req.user!.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putItem(TableNames.Projects, project);
  res.status(201).json(project);
});

router.put('/:id', requireRole('manager'), async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const updates: Record<string, any> = {
    name: name.trim(),
    description: description?.trim() || '',
    updatedAt: new Date().toISOString(),
  };
  await updateItem(TableNames.Projects, { projectId: req.params.id }, updates);
  res.json({ ...updates, projectId: req.params.id });
});

router.delete('/:id', requireRole('manager'), async (req, res) => {
  await deleteItem(TableNames.Projects, { projectId: req.params.id });
  res.json({ ok: true });
});

export default router;
