'use strict';

const { Router } = require('express');
const taskController = require('../controllers/taskController');

const router = Router();

// All routes protected by authMiddleware (applied in app.js)

router.get('/', taskController.listTasks);                               // ?teamId=xxx or all (manager)
router.get('/assignee/:assigneeId', taskController.getTasksByAssignee);
router.get('/:taskId', taskController.getTaskById);
router.post('/', taskController.createTask);
router.patch('/:taskId', taskController.updateTask);                     // PATCH for partial updates
router.patch('/:taskId/status', taskController.updateTaskStatus);        // dedicated status endpoint
router.delete('/:taskId', taskController.deleteTask);

// Image endpoints (pre-signed URL flow)
router.post('/:taskId/image', taskController.requestImageUpload);        // → returns { uploadUrl, imageUrl }
router.delete('/:taskId/image', taskController.deleteTaskImage);

module.exports = router;
