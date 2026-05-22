import { Router } from 'express';
import { TableNames, getItem, putItem, deleteItem, queryItems, scanItems, updateItem } from '../db.js';
import { requireRole } from '../auth.js';
import { publishTaskAssigned } from '../services/sns.js';
import { putMetric } from '../services/cloudwatch.js';
const router = Router();
const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
router.get('/', async (req, res) => {
    const user = req.user;
    let tasks = [];
    if (user.role === 'manager') {
        tasks = await scanItems(TableNames.Tasks);
    }
    else {
        tasks = await queryItems(TableNames.Tasks, {
            IndexName: 'TeamIdIndex',
            KeyConditionExpression: 'teamId = :t',
            ExpressionAttributeValues: { ':t': user.teamId },
        });
    }
    res.json(tasks);
});
router.get('/:id', async (req, res) => {
    const user = req.user;
    const task = await getItem(TableNames.Tasks, { id: req.params.id });
    if (!task) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (user.role !== 'manager' && task.teamId !== user.teamId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(task);
});
router.post('/', requireRole('manager'), async (req, res) => {
    const { title, description, priority, deadline, assigneeId, teamId, projectId, imageKey } = req.body;
    if (!title || !teamId || !assigneeId) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    const task = {
        id: crypto.randomUUID(),
        title,
        description: description || '',
        status: 'TODO',
        priority: priority || 'MEDIUM',
        deadline: deadline || null,
        assigneeId,
        teamId,
        projectId: projectId || null,
        imageKey: imageKey || null,
        createdBy: req.user.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await putItem(TableNames.Tasks, task);
    await publishTaskAssigned(task);
    await putMetric('TasksCreated', 1, [{ Name: 'Team', Value: teamId }]);
    res.status(201).json(task);
});
router.put('/:id', async (req, res) => {
    const user = req.user;
    const existing = await getItem(TableNames.Tasks, { id: req.params.id });
    if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (user.role !== 'manager' && existing.teamId !== user.teamId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const allowedFields = {};
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
    }
    else {
        if (existing.assigneeId !== user.userId) {
            res.status(403).json({ error: 'Not assigned to you' });
            return;
        }
        allowedFields.status = true;
    }
    const updates = {};
    for (const key of Object.keys(req.body)) {
        if (allowedFields[key])
            updates[key] = req.body[key];
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
            taskId: existing.id,
            timestamp: new Date().toISOString(),
            action: 'STATUS_CHANGE',
            actorId: user.userId,
            details: { from: existing.status, to: updates.status },
        };
        await putItem(TableNames.ActivityLog, logEntry);
        if (updates.status === 'DONE') {
            const created = new Date(existing.createdAt).getTime();
            const closed = Date.now();
            const hours = (closed - created) / (1000 * 60 * 60);
            await putMetric('TasksClosed', 1, [{ Name: 'Team', Value: existing.teamId }]);
            await putMetric('TimeToClose', hours, [{ Name: 'Team', Value: existing.teamId }]);
        }
    }
    updates.updatedAt = new Date().toISOString();
    await updateItem(TableNames.Tasks, { id: req.params.id }, updates);
    const updated = { ...existing, ...updates };
    res.json(updated);
});
router.delete('/:id', requireRole('manager'), async (req, res) => {
    const task = await getItem(TableNames.Tasks, { id: req.params.id });
    if (!task) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    await deleteItem(TableNames.Tasks, { id: req.params.id });
    res.status(204).send();
});
export default router;
//# sourceMappingURL=tasks.js.map