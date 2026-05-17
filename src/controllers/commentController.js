'use strict';

const commentService = require('../services/commentService');

async function getCommentsByTask(req, res) {
  const comments = await commentService.getCommentsByTask(req.params.taskId, req.user);
  res.json(comments);
}

async function createComment(req, res) {
  const comment = await commentService.createComment(req.params.taskId, req.body, req.user);
  res.status(201).json(comment);
}

async function deleteComment(req, res) {
  await commentService.deleteComment(req.params.taskId, req.params.commentId, req.user);
  res.status(204).send();
}

module.exports = { getCommentsByTask, createComment, deleteComment };
