'use strict';

const commentService = require('../services/commentService');
const { toFrontendComment } = require('../utils/transform');

async function getCommentsByTask(req, res) {
  const comments = await commentService.getCommentsByTask(req.params.taskId, req.user);
  res.json(comments.map(toFrontendComment));
}

async function createComment(req, res) {
  // Frontend sends { body: '...' }; commentService stores as { content: '...' }
  const content = req.body.body || req.body.content;
  const comment = await commentService.createComment(req.params.taskId, { content }, req.user);
  res.status(201).json(toFrontendComment(comment));
}

async function deleteComment(req, res) {
  await commentService.deleteComment(req.params.taskId, req.params.commentId, req.user);
  res.status(204).send();
}

module.exports = { getCommentsByTask, createComment, deleteComment };
