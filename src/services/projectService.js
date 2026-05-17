'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES } = require('../config/dynamodb');

function forbidden(message = 'Access denied') {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function notFound(message = 'Project not found') {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

async function getProjectById(projectId, requestingUser) {
  const { Item: project } = await docClient.send(
    new GetCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { projectId } })
  );

  if (!project) throw notFound();

  if (requestingUser.role === 'Employee' && project.teamId !== requestingUser.teamId) {
    throw forbidden('You do not have access to this project');
  }

  return project;
}

async function getAllProjects(requestingUser) {
  const { Items } = await docClient.send(
    new ScanCommand({ TableName: TABLE_NAMES.PROJECTS })
  );

  if (requestingUser.role === 'Employee') {
    return Items.filter((p) => p.teamId === requestingUser.teamId);
  }

  return Items;
}

async function createProject(payload, requestingUser) {
  const { name, description } = payload;

  if (!name) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  const teamId = requestingUser.role === 'Employee' ? requestingUser.teamId : payload.teamId;

  if (!teamId) {
    const err = new Error('teamId is required');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const project = {
    projectId: uuidv4(),
    name,
    description: description || '',
    teamId,
    status: payload.status || 'Active',
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.PROJECTS, Item: project }));

  return project;
}

async function updateProject(projectId, updates, requestingUser) {
  await getProjectById(projectId, requestingUser);

  const allowed = ['name', 'description', 'status'];
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
      TableName: TABLE_NAMES.PROJECTS,
      Key: { projectId },
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );

  return updated;
}

async function deleteProject(projectId, requestingUser) {
  await getProjectById(projectId, requestingUser);

  await docClient.send(
    new DeleteCommand({ TableName: TABLE_NAMES.PROJECTS, Key: { projectId } })
  );
}

module.exports = { getProjectById, getAllProjects, createProject, updateProject, deleteProject };
