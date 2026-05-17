'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES, GSI_NAMES } = require('../config/dynamodb');

// ─── helpers ────────────────────────────────────────────────────────────────

function forbidden(message = 'Access denied') {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function notFound(message = 'Task not found') {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

// ─── read ────────────────────────────────────────────────────────────────────

/**
 * Fetch a single task. Employees are blocked if the task belongs to a
 * different team — this is the central RBAC gate reused by update/delete.
 */
async function getTaskById(taskId, requestingUser) {
  const { Item: task } = await docClient.send(
    new GetCommand({ TableName: TABLE_NAMES.TASKS, Key: { taskId } })
  );

  if (!task) throw notFound();

  if (requestingUser.role === 'Employee' && task.teamId !== requestingUser.teamId) {
    throw forbidden('You do not have access to this task');
  }

  return task;
}

/**
 * Query the teamId-index GSI.
 * Employees can only query their own team; Managers can query any.
 */
async function getTasksByTeam(teamId, requestingUser) {
  if (requestingUser.role === 'Employee' && requestingUser.teamId !== teamId) {
    throw forbidden('Employees can only view tasks for their own team');
  }

  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.TASKS,
      IndexName: GSI_NAMES.TASKS_BY_TEAM,
      KeyConditionExpression: 'teamId = :tid',
      ExpressionAttributeValues: { ':tid': teamId },
      ScanIndexForward: false, // newest first
    })
  );

  return Items;
}

/**
 * Query the assigneeId-index GSI.
 * Employees can only see results within their own team.
 */
async function getTasksByAssignee(assigneeId, requestingUser) {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.TASKS,
      IndexName: GSI_NAMES.TASKS_BY_ASSIGNEE,
      KeyConditionExpression: 'assigneeId = :aid',
      ExpressionAttributeValues: { ':aid': assigneeId },
      ScanIndexForward: false,
    })
  );

  if (requestingUser.role === 'Employee') {
    // Filter post-query so employees only see tasks inside their own team
    return Items.filter((t) => t.teamId === requestingUser.teamId);
  }

  return Items;
}

/**
 * Scan all tasks — Manager-only operation.
 */
async function getAllTasks(requestingUser) {
  if (requestingUser.role !== 'Manager') {
    throw forbidden('Only Managers can list all tasks');
  }

  const { Items } = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAMES.TASKS })
  );

  return Items;
}

// ─── write ───────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

async function createTask(payload, requestingUser) {
  const { title, description, status, priority, deadline, assigneeId, projectId } = payload;

  if (!title) {
    const err = new Error('title is required');
    err.statusCode = 400;
    throw err;
  }

  const resolvedStatus = status || 'To Do';
  const resolvedPriority = priority || 'Medium';

  if (!VALID_STATUSES.includes(resolvedStatus)) {
    const err = new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (!VALID_PRIORITIES.includes(resolvedPriority)) {
    const err = new Error(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // Employees are always scoped to their own team — they cannot self-assign to another
  const teamId = requestingUser.role === 'Employee' ? requestingUser.teamId : payload.teamId;

  if (!teamId) {
    const err = new Error('teamId is required');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const task = {
    taskId: uuidv4(),
    title,
    description: description || '',
    status: resolvedStatus,
    priority: resolvedPriority,
    deadline: deadline || null,
    assigneeId: assigneeId || null,
    teamId,
    projectId: projectId || null,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.TASKS, Item: task }));

  return task;
}

async function updateTask(taskId, updates, requestingUser) {
  // getTaskById enforces RBAC before we attempt the write
  await getTaskById(taskId, requestingUser);

  const allowed = ['title', 'description', 'status', 'priority', 'deadline', 'assigneeId', 'projectId'];

  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    const err = new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (updates.priority && !VALID_PRIORITIES.includes(updates.priority)) {
    const err = new Error(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // Build a dynamic UpdateExpression from the provided fields
  const setClauses = ['updatedAt = :updatedAt'];
  const names = {};
  const values = { ':updatedAt': new Date().toISOString() };

  for (const field of allowed) {
    if (updates[field] !== undefined) {
      setClauses.push(`#${field} = :${field}`);
      names[`#${field}`] = field;
      values[`:${field}`] = updates[field];
    }
  }

  const { Attributes: updated } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.TASKS,
      Key: { taskId },
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );

  return updated;
}

async function deleteTask(taskId, requestingUser) {
  // getTaskById enforces RBAC — throws 403/404 as appropriate
  await getTaskById(taskId, requestingUser);

  await docClient.send(
    new DeleteCommand({ TableName: TABLE_NAMES.TASKS, Key: { taskId } })
  );
}

module.exports = {
  getTaskById,
  getTasksByTeam,
  getTasksByAssignee,
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
};
