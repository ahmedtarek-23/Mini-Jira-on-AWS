'use strict';

const { Router } = require('express');
const projectController = require('../controllers/projectController');

const router = Router();

router.get('/', projectController.getAllProjects);
router.get('/:projectId', projectController.getProjectById);
router.post('/', projectController.createProject);
router.put('/:projectId', projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

module.exports = router;
