'use strict';

const taskService = require('../services/taskService');
const s3Service = require('../services/s3Service');
const { toFrontendTask, statusToDb, priorityToDb } = require('../utils/transform');

async function listTasks(req, res) {
  const { teamId } = req.query;
  let tasks;

  if (teamId && teamId !== 'all') {
    tasks = await taskService.getTasksByTeam(teamId, req.user);
  } else {
    tasks = await taskService.getAllTasks(req.user);
  }

  res.json(tasks.map(toFrontendTask));
}

async function getTasksByAssignee(req, res) {
  const tasks = await taskService.getTasksByAssignee(req.params.assigneeId, req.user);
  res.json(tasks.map(toFrontendTask));
}

async function getTaskById(req, res) {
  const task = await taskService.getTaskById(req.params.taskId, req.user);
  res.json(toFrontendTask(task));
}

async function createTask(req, res) {
  const body = req.body;
  // Translate frontend enums → DB values
  const payload = {
    ...body,
    status: body.status ? statusToDb(body.status) : undefined,
    priority: body.priority ? priorityToDb(body.priority) : undefined,
  };
  const task = await taskService.createTask(payload, req.user);
  res.status(201).json(toFrontendTask(task));
}

async function updateTask(req, res) {
  const body = req.body;
  const updates = {
    ...body,
    status: body.status ? statusToDb(body.status) : undefined,
    priority: body.priority ? priorityToDb(body.priority) : undefined,
  };
  const task = await taskService.updateTask(req.params.taskId, updates, req.user);
  res.json(toFrontendTask(task));
}

async function updateTaskStatus(req, res) {
  const dbStatus = statusToDb(req.body.status);
  const task = await taskService.updateTask(req.params.taskId, { status: dbStatus }, req.user);
  res.json(toFrontendTask(task));
}

async function deleteTask(req, res) {
  await taskService.deleteTask(req.params.taskId, req.user);
  res.status(204).send();
}

/**
 * Returns a pre-signed S3 PUT URL; the browser uploads directly to S3.
 * Body: { contentType: 'image/jpeg' }
 */
async function requestImageUpload(req, res) {
  const task = await taskService.getTaskById(req.params.taskId, req.user);

  // If the task already has an image, archive the old key before issuing a new one
  if (task.imageKey) {
    await s3Service.deleteObject(task.imageKey).catch(() => {});
  }

  const contentType = req.body.contentType || 'image/jpeg';
  const { uploadUrl, key, imageUrl } = await s3Service.getPresignedUploadUrl(
    req.params.taskId,
    contentType
  );

  // Persist the new imageKey + imageUrl on the task record
  await taskService.updateTask(req.params.taskId, { imageKey: key, imageUrl }, req.user);

  res.json({ uploadUrl, imageUrl });
}

async function deleteTaskImage(req, res) {
  const task = await taskService.getTaskById(req.params.taskId, req.user);

  if (task.imageKey) {
    await s3Service.deleteObject(task.imageKey).catch(() => {});
    await s3Service.deleteResizedObject(task.imageKey).catch(() => {});
  }

  const updated = await taskService.updateTask(
    req.params.taskId,
    { imageKey: null, imageUrl: null },
    req.user
  );

  res.json(toFrontendTask(updated));
}

module.exports = {
  listTasks,
  getTasksByAssignee,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  requestImageUpload,
  deleteTaskImage,
};
