import { Router } from 'express';
import crypto from 'node:crypto';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { TableNames, putItem, deleteItem, queryItems, scanItems, updateItem } from '../db.js';
import { requireRole } from '../auth.js';
import { publishTaskAssigned } from '../services/sns.js';
import { putMetric } from '../services/cloudwatch.js';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const ORIGINALS_BUCKET = process.env.S3_BUCKET_ORIGINALS || '';
const RESIZED_BUCKET = process.env.S3_BUCKET_RESIZED || '';

async function deleteTaskImages(imageKey: string | null | undefined) {
  if (!imageKey) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: ORIGINALS_BUCKET, Key: imageKey }));
  } catch (e: any) {
    console.error('Failed to delete original image:', e.message);
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: RESIZED_BUCKET, Key: imageKey }));
  } catch (e: any) {
    console.error('Failed to delete resized image:', e.message);
  }
}

const router = Router();

const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

router.get('/', async (req, res) => {
  const user = req.user!;
  let tasks: any[] = [];
  if (user.role === 'manager') {
    tasks = await scanItems(TableNames.Tasks);
  } else {
    tasks = await queryItems(TableNames.Tasks, {
      IndexName: 'TeamIdIndex',
      KeyConditionExpression: 'teamId = :t',
      ExpressionAttributeValues: { ':t': user.teamId },
    });
  }
  res.json(tasks);
});

router.get('/:id', async (req, res) => {
  const user = req.user!;
  const items = await queryItems<any>(TableNames.Tasks, {
    KeyConditionExpression: 'taskId = :id',
    ExpressionAttributeValues: { ':id': req.params.id },
  });
  const task = items[0];
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  if (user.role !== 'manager' && task.teamId !== user.teamId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(task);
});

router.post('/', requireRole('manager'), async (req, res) => {
  try {
    const { title, description, priority, deadline, assigneeId, teamId, projectId, imageKey } = req.body;
    if (!title || !teamId || !assigneeId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const taskId = crypto.randomUUID();
    const task = {
      taskId,
      id: taskId,
      title,
      description: description || '',
      status: 'TODO',
      priority: priority || 'MEDIUM',
      deadline: deadline || null,
      assignee: assigneeId,
      assigneeId,
      teamId,
      projectId: projectId || null,
      imageKey: imageKey || null,
      createdBy: req.user!.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await putItem(TableNames.Tasks, task);
    try { await publishTaskAssigned(task); } catch (e: any) { console.error('SNS publish error:', e.message); }
    try { await putMetric('TasksCreated', 1, [{ Name: 'Team', Value: teamId }]); } catch (e: any) { console.error('Metric error:', e.message); }
    try {
      await putItem(TableNames.ActivityLog, {
        logId: crypto.randomUUID(),
        taskId,
        timestamp: new Date().toISOString(),
        action: 'CREATED',
        actorId: req.user!.userId,
        details: { title, assigneeId, teamId },
      });
    } catch (e: any) { console.error('Activity log error:', e.message); }
    res.status(201).json(task);
  } catch (err: any) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Failed to create task', detail: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = req.user!;
    const items = await queryItems<any>(TableNames.Tasks, {
      KeyConditionExpression: 'taskId = :id',
      ExpressionAttributeValues: { ':id': req.params.id },
    });
    const existing = items[0];
    if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
    if (user.role !== 'manager' && existing.teamId !== user.teamId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const allowedFields: Record<string, boolean> = {};
    if (user.role === 'manager') {
      allowedFields.title = true;
      allowedFields.description = true;
      allowedFields.priority = true;
      allowedFields.deadline = true;
      allowedFields.assigneeId = true;
      allowedFields.teamId = true;
      allowedFields.projectId = true;
      allowedFields.imageKey = true;
      allowedFields.status = true;
    } else {
      if (existing.assigneeId !== user.userId) {
        res.status(403).json({ error: 'Not assigned to you' });
        return;
      }
      allowedFields.status = true;
    }

    const updates: Record<string, any> = {};
    for (const key of Object.keys(req.body)) {
      if (allowedFields[key]) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    if (updates.status && updates.status !== existing.status) {
      const logEntry = {
        logId: crypto.randomUUID(),
        taskId: existing.taskId || existing.id,
        timestamp: new Date().toISOString(),
        action: 'STATUS_CHANGE',
        actorId: user.userId,
        details: { from: existing.status, to: updates.status },
      };
      try { await putItem(TableNames.ActivityLog, logEntry); } catch (e: any) { console.error('Activity log error:', e.message); }
      if (updates.status === 'DONE') {
        const created = new Date(existing.createdAt).getTime();
        const closed = Date.now();
        const hours = (closed - created) / (1000 * 60 * 60);
        try { await putMetric('TasksClosed', 1, [{ Name: 'Team', Value: existing.teamId }]); } catch (e: any) { console.error('Metric error:', e.message); }
        try { await putMetric('TimeToClose', hours, [{ Name: 'Team', Value: existing.teamId }]); } catch (e: any) { console.error('Metric error:', e.message); }
      }
    }

    if (updates.assigneeId !== undefined && updates.assigneeId !== existing.assigneeId) {
      const reassigned = { ...existing, ...updates };
      try { await publishTaskAssigned(reassigned); } catch (e: any) { console.error('SNS publish error:', e.message); }
    }

    if (updates.imageKey !== undefined && updates.imageKey !== existing.imageKey) {
      await deleteTaskImages(existing.imageKey);
    }

    updates.updatedAt = new Date().toISOString();
    const taskKey = { taskId: existing.taskId || existing.id, createdAt: existing.createdAt || new Date().toISOString() };
    if (!taskKey.taskId) {
      res.status(500).json({ error: 'Task missing primary key' });
      return;
    }
    await updateItem(TableNames.Tasks, taskKey, updates);
    const updated = { ...existing, ...updates };
    updated.id = updated.taskId || updated.id;
    res.json(updated);
  } catch (err: any) {
    console.error('PUT /tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task', detail: err.message });
  }
});

router.delete('/:id', requireRole('manager'), async (req, res) => {
  const items = await queryItems<any>(TableNames.Tasks, {
    KeyConditionExpression: 'taskId = :id',
    ExpressionAttributeValues: { ':id': req.params.id },
  });
  const task = items[0];
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  await deleteTaskImages(task.imageKey);
  try {
    await putItem(TableNames.ActivityLog, {
      logId: crypto.randomUUID(),
      taskId: task.taskId || task.id,
      timestamp: new Date().toISOString(),
      action: 'DELETED',
      actorId: req.user!.userId,
      details: { title: task.title, teamId: task.teamId },
    });
  } catch (e: any) { console.error('Activity log error:', e.message); }
  await deleteItem(TableNames.Tasks, { taskId: task.taskId, createdAt: task.createdAt });
  res.status(204).send();
});

export default router;
