'use strict';

const taskService = require('../services/taskService');
const projectService = require('../services/projectService');
const teamService = require('../services/teamService');
const { toFrontendTask, toFrontendProject } = require('../utils/transform');

/**
 * Single endpoint that returns everything the frontend needs on initial load.
 * Manager: all tasks (Scan) + all teams + all users + all projects
 * Employee: own-team tasks (GSI) + own team + own team users + own team projects
 */
async function bootstrap(req, res) {
  const { user } = req;
  const isManager = user.role === 'Manager';

  const [rawTasks, projects, teams, users] = await Promise.all([
    isManager ? taskService.getAllTasks(user) : taskService.getTasksByTeam(user.teamId, user),
    isManager ? projectService.getAllProjects(user) : projectService.getAllProjects(user),
    teamService.listTeams(),
    isManager ? teamService.listAllUsers() : teamService.listUsersByTeam(user.teamId),
  ]);

  const tasks = rawTasks.map(toFrontendTask);
  const frontendProjects = projects.map ? projects.map(toFrontendProject) : [toFrontendProject(projects)];

  res.json({ tasks, teams, users, projects: frontendProjects });
}

module.exports = { bootstrap };
