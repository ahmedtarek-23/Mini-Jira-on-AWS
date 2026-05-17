'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  PutCommand,
  DeleteCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES } = require('../config/dynamodb');
const { getTaskById } = require('./taskService');

// Comments are sub-resources of tasks, so access is gated by task RBAC
async function getCommentsByTask(taskId, requestingUser) {
  // Verifies task existence and enforces team isolation
  await getTaskById(taskId, requestingUser);

  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.COMMENTS,
      KeyConditionExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':tid': taskId },
      ScanIndexForward: true,
    })
  );

  return Items;
}

async function createComment(taskId, payload, requestingUser) {
  await getTaskById(taskId, requestingUser);

  const { content } = payload;
  if (!content) {
    const err = new Error('content is required');
    err.statusCode = 400;
    throw err;
  }

  const comment = {
    taskId,
    commentId: uuidv4(),
    authorId: requestingUser.userId,
    content,
    createdAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.COMMENTS, Item: comment }));

  return comment;
}

async function deleteComment(taskId, commentId, requestingUser) {
  await getTaskById(taskId, requestingUser);

  await docClient.send(
    new DeleteCommand({ TableName: TABLE_NAMES.COMMENTS, Key: { taskId, commentId } })
  );
}

module.exports = { getCommentsByTask, createComment, deleteComment };
