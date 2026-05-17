'use strict';

// ─── Status mappings ─────────────────────────────────────────────────────────
const STATUS_TO_FRONTEND = {
  'To Do': 'todo',
  'In Progress': 'in_progress',
  'In Review': 'in_review',
  'Done': 'done',
};

const STATUS_TO_DB = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

// ─── Priority mappings ────────────────────────────────────────────────────────
const PRIORITY_TO_FRONTEND = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'urgent', // frontend uses 'urgent' for the highest level
};

const PRIORITY_TO_DB = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Critical',
};

// ─── Role mappings ────────────────────────────────────────────────────────────
const ROLE_TO_FRONTEND = { Manager: 'manager', Employee: 'employee' };
const ROLE_TO_DB = { manager: 'Manager', employee: 'Employee' };

// ─── Entity transforms ────────────────────────────────────────────────────────

function toFrontendTask(item) {
  if (!item) return null;
  return {
    id: item.taskId,
    title: item.title,
    description: item.description || '',
    status: STATUS_TO_FRONTEND[item.status] || item.status,
    priority: PRIORITY_TO_FRONTEND[item.priority] || item.priority,
    deadline: item.deadline || '',
    assigneeId: item.assigneeId || '',
    teamId: item.teamId,
    projectId: item.projectId || null,
    imageUrl: item.imageUrl || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toFrontendProject(item) {
  if (!item) return null;
  return {
    id: item.projectId,
    name: item.name,
    description: item.description || '',
    teamId: item.teamId || null,
    status: item.status || 'Active',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toFrontendComment(item) {
  if (!item) return null;
  return {
    id: item.commentId,
    taskId: item.taskId,
    authorId: item.authorId,
    body: item.content, // frontend calls this 'body', DB stores as 'content'
    createdAt: item.createdAt,
  };
}

function toFrontendUser(item) {
  if (!item) return null;
  return {
    id: item.userId || item.sub,
    name: item.name || item.email,
    email: item.email,
    role: ROLE_TO_FRONTEND[item.role] || item.role,
    teamId: item.teamId || null,
    title: item.title || item.role || '',
  };
}

function toFrontendTeam(item) {
  if (!item) return null;
  return {
    id: item.teamId,
    name: item.name,
    color: item.color || '#6366f1',
  };
}

// ─── DB-bound transforms (frontend body → DynamoDB field values) ──────────────

function statusToDb(status) {
  return STATUS_TO_DB[status] || status;
}

function priorityToDb(priority) {
  return PRIORITY_TO_DB[priority] || priority;
}

function roleToDb(role) {
  return ROLE_TO_DB[role] || role;
}

// Maps the comment 'body' field the frontend sends → 'content' for DynamoDB
function toDbComment(body) {
  return { content: body };
}

module.exports = {
  toFrontendTask,
  toFrontendProject,
  toFrontendComment,
  toFrontendUser,
  toFrontendTeam,
  statusToDb,
  priorityToDb,
  roleToDb,
  toDbComment,
};
