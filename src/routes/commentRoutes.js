'use strict';

const { Router } = require('express');
const commentController = require('../controllers/commentController');

// Comments are nested under tasks: /tasks/:taskId/comments
const router = Router({ mergeParams: true });

router.get('/', commentController.getCommentsByTask);
router.post('/', commentController.createComment);
router.delete('/:commentId', commentController.deleteComment);

module.exports = router;
