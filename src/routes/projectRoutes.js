'use strict';

const { Router } = require('express');
const projectController = require('../controllers/projectController');

const router = Router();

router.get('/', projectController.getAllProjects);
router.get('/:projectId', projectController.getProjectById);
router.post('/', projectController.createProject);
router.patch('/:projectId', projectController.updateProject); // PATCH for partial updates
router.delete('/:projectId', projectController.deleteProject);

module.exports = router;
