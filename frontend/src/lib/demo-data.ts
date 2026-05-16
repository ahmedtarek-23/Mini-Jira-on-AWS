import type { AppBootstrap, TaskComment, User } from "@/lib/types";

const now = new Date();
const addDays = (days: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();

export const demoUsers: User[] = [
  {
    id: "user-ali",
    name: "Manager Ali",
    email: "ali@mini-jira.local",
    role: "manager",
    title: "Engineering Manager",
  },
  {
    id: "user-sara",
    name: "Sara",
    email: "sara@mini-jira.local",
    role: "employee",
    teamId: "team-frontend",
    title: "Frontend Engineer",
  },
  {
    id: "user-omar",
    name: "Omar",
    email: "omar@mini-jira.local",
    role: "employee",
    teamId: "team-backend",
    title: "Backend Engineer",
  },
];

export const demoBootstrap: AppBootstrap = {
  teams: [
    { id: "team-frontend", name: "Frontend", color: "#0d9488" },
    { id: "team-backend", name: "Backend", color: "#2563eb" },
  ],
  users: demoUsers,
  projects: [
    {
      id: "project-cloud-ui",
      name: "Cloud Task Console",
      description: "Demo-ready frontend for the Mini-Jira on AWS assignment.",
      teamId: "team-frontend",
      createdAt: addDays(-5),
      updatedAt: addDays(-1),
    },
    {
      id: "project-api",
      name: "Task API Services",
      description: "Serverless task, comments, and attachment API integration.",
      teamId: "team-backend",
      createdAt: addDays(-4),
      updatedAt: addDays(-2),
    },
  ],
  tasks: [
    {
      id: "task-a",
      title: "Task A: Build Kanban task cards",
      description:
        "Create polished task cards with priority, assignee, deadline, team, and attachment states for the demo board.",
      status: "in_progress",
      priority: "high",
      deadline: addDays(2),
      assigneeId: "user-sara",
      teamId: "team-frontend",
      projectId: "project-cloud-ui",
      imageUrl:
        "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
      createdAt: addDays(-3),
      updatedAt: addDays(-1),
      history: [
        {
          id: "history-a-1",
          actorName: "Manager Ali",
          message: "Created task and assigned it to Sara.",
          createdAt: addDays(-3),
        },
        {
          id: "history-a-2",
          actorName: "Sara",
          message: "Moved task to In Progress.",
          createdAt: addDays(-1),
        },
      ],
    },
    {
      id: "task-b",
      title: "Task B: Connect comments API",
      description:
        "Wire the task detail comments thread to the backend contract and keep a local fallback for classroom demos.",
      status: "in_review",
      priority: "medium",
      deadline: addDays(4),
      assigneeId: "user-omar",
      teamId: "team-backend",
      projectId: "project-api",
      createdAt: addDays(-2),
      updatedAt: addDays(-1),
      history: [
        {
          id: "history-b-1",
          actorName: "Manager Ali",
          message: "Created task and assigned it to Omar.",
          createdAt: addDays(-2),
        },
        {
          id: "history-b-2",
          actorName: "Omar",
          message: "Moved task to In Review.",
          createdAt: addDays(-1),
        },
      ],
    },
  ],
};

export const demoComments: TaskComment[] = [
  {
    id: "comment-a-1",
    taskId: "task-a",
    authorId: "user-ali",
    body: "Keep the card readable on laptop and mobile screen sizes.",
    createdAt: addDays(-2),
  },
  {
    id: "comment-a-2",
    taskId: "task-a",
    authorId: "user-sara",
    body: "Added the attachment indicator and compact metadata layout.",
    createdAt: addDays(-1),
  },
  {
    id: "comment-b-1",
    taskId: "task-b",
    authorId: "user-omar",
    body: "The fallback client is ready. Backend route names can be mapped in the API layer.",
    createdAt: addDays(-1),
  },
];
