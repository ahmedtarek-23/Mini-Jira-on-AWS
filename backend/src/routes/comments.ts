import { Router } from 'express';
import crypto from 'node:crypto';
import { TableNames, putItem, queryItems } from '../db.js';

const router = Router();

async function getTask(taskId: string) {
  const items = await queryItems<any>(TableNames.Tasks, {
    KeyConditionExpression: 'taskId = :id',
    ExpressionAttributeValues: { ':id': taskId },
  });
  return items[0] || null;
}

router.get('/', async (req, res) => {
  const { taskId } = req.query;
  if (!taskId) { res.status(400).json({ error: 'Missing taskId' }); return; }

  const task = await getTask(taskId as string);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  if (req.user!.role !== 'manager' && task.teamId !== req.user!.teamId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const comments = await queryItems<any>(TableNames.Comments, {
    IndexName: 'TaskIdIndex',
    KeyConditionExpression: 'taskId = :t',
    ExpressionAttributeValues: { ':t': taskId },
  });
  res.json(comments);
});

router.post('/', async (req, res) => {
  const { taskId, text } = req.body;
  if (!taskId || !text) { res.status(400).json({ error: 'Missing fields' }); return; }

  const task = await getTask(taskId);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  if (req.user!.role !== 'manager' && task.teamId !== req.user!.teamId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const comment = {
    commentId: crypto.randomUUID(),
    taskId,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    authorId: req.user!.userId,
    text,
  };
  await putItem(TableNames.Comments, comment);
  res.status(201).json(comment);
});

export default router;
