'use strict';

const projectService = require('../services/projectService');
const { toFrontendProject } = require('../utils/transform');

async function getAllProjects(req, res) {
  const projects = await projectService.getAllProjects(req.user);
  res.json(projects.map(toFrontendProject));
}

async function getProjectById(req, res) {
  const project = await projectService.getProjectById(req.params.projectId, req.user);
  res.json(toFrontendProject(project));
}

async function createProject(req, res) {
  const project = await projectService.createProject(req.body, req.user);
  res.status(201).json(toFrontendProject(project));
}

async function updateProject(req, res) {
  const project = await projectService.updateProject(req.params.projectId, req.body, req.user);
  res.json(toFrontendProject(project));
}

async function deleteProject(req, res) {
  await projectService.deleteProject(req.params.projectId, req.user);
  res.status(204).send();
}

module.exports = { getAllProjects, getProjectById, createProject, updateProject, deleteProject };
