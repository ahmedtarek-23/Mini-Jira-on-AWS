import { Router } from 'express';
import crypto from 'node:crypto';
import { TableNames, putItem, scanItems, updateItem, deleteItem } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  const teams = await scanItems(TableNames.Teams);
  res.json(teams);
});

router.post('/', requireRole('manager'), async (req, res) => {
  const { name } = req.body;
  const teamId = crypto.randomUUID();
  const team = { teamId, id: teamId, name, createdAt: new Date().toISOString() };
  await putItem(TableNames.Teams, team);
  res.status(201).json(team);
});

router.put('/:id', requireRole('manager'), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  await updateItem(TableNames.Teams, { teamId: req.params.id }, {
    name: name.trim(),
    updatedAt: new Date().toISOString(),
  });
  res.json({ ok: true, id: req.params.id, name: name.trim() });
});

router.delete('/:id', requireRole('manager'), async (req, res) => {
  await deleteItem(TableNames.Teams, { teamId: req.params.id });
  res.json({ ok: true });
});

export default router;
