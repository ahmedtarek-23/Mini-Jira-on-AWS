'use strict';

const taskService = require('../services/taskService');

async function getAllTasks(req, res) {
  const tasks = await taskService.getAllTasks(req.user);
  res.json(tasks);
}

async function getTasksByTeam(req, res) {
  const tasks = await taskService.getTasksByTeam(req.params.teamId, req.user);
  res.json(tasks);
}

async function getTasksByAssignee(req, res) {
  const tasks = await taskService.getTasksByAssignee(req.params.assigneeId, req.user);
  res.json(tasks);
}

async function getTaskById(req, res) {
  const task = await taskService.getTaskById(req.params.taskId, req.user);
  res.json(task);
}

async function createTask(req, res) {
  const task = await taskService.createTask(req.body, req.user);
  res.status(201).json(task);
}

async function updateTask(req, res) {
  const task = await taskService.updateTask(req.params.taskId, req.body, req.user);
  res.json(task);
}

async function deleteTask(req, res) {
  await taskService.deleteTask(req.params.taskId, req.user);
  res.status(204).send();
}

module.exports = { getAllTasks, getTasksByTeam, getTasksByAssignee, getTaskById, createTask, updateTask, deleteTask };
