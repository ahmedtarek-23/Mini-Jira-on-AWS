'use strict';

const { Router } = require('express');
const taskController = require('../controllers/taskController');

const router = Router();

// All routes in this file are already protected by authMiddleware (applied in app.js)

router.get('/', taskController.getAllTasks);                              // Manager only
router.get('/team/:teamId', taskController.getTasksByTeam);
router.get('/assignee/:assigneeId', taskController.getTasksByAssignee);
router.get('/:taskId', taskController.getTaskById);
router.post('/', taskController.createTask);
router.put('/:taskId', taskController.updateTask);
router.delete('/:taskId', taskController.deleteTask);

module.exports = router;
