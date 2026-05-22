import { Router } from 'express';
import { TableNames, putItem, queryItems } from '../db.js';
const router = Router();
router.get('/', async (req, res) => {
    const { taskId } = req.query;
    if (!taskId) {
        res.status(400).json({ error: 'Missing taskId' });
        return;
    }
    const comments = await queryItems(TableNames.Comments, {
        KeyConditionExpression: 'taskId = :t',
        ExpressionAttributeValues: { ':t': taskId },
    });
    res.json(comments);
});
router.post('/', async (req, res) => {
    const { taskId, text } = req.body;
    if (!taskId || !text) {
        res.status(400).json({ error: 'Missing fields' });
        return;
    }
    const comment = {
        taskId,
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID(),
        authorId: req.user.userId,
        text,
    };
    await putItem(TableNames.Comments, comment);
    res.status(201).json(comment);
});
export default router;
//# sourceMappingURL=comments.js.map