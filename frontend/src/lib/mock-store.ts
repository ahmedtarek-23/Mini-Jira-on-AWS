import { demoBootstrap, demoComments } from "@/lib/demo-data";
import type {
  AppBootstrap,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  Task,
  TaskComment,
  TaskStatus,
  UpdateTaskInput,
  User,
} from "@/lib/types";

const bootstrapKey = "mini-jira-demo-bootstrap";
const commentsKey = "mini-jira-demo-comments";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readBootstrap(): AppBootstrap {
  if (typeof window === "undefined") {
    return clone(demoBootstrap);
  }

  const stored = window.localStorage.getItem(bootstrapKey);
  if (!stored) {
    window.localStorage.setItem(bootstrapKey, JSON.stringify(demoBootstrap));
    return clone(demoBootstrap);
  }

  return JSON.parse(stored) as AppBootstrap;
}

function writeBootstrap(data: AppBootstrap) {
  window.localStorage.setItem(bootstrapKey, JSON.stringify(data));
}

function readComments(): TaskComment[] {
  if (typeof window === "undefined") {
    return clone(demoComments);
  }

  const stored = window.localStorage.getItem(commentsKey);
  if (!stored) {
    window.localStorage.setItem(commentsKey, JSON.stringify(demoComments));
    return clone(demoComments);
  }

  return JSON.parse(stored) as TaskComment[];
}

function writeComments(comments: TaskComment[]) {
  window.localStorage.setItem(commentsKey, JSON.stringify(comments));
}

function visibleTasksFor(user: User, tasks: Task[]) {
  if (user.role === "manager") {
    return tasks;
  }

  return tasks.filter((task) => task.teamId === user.teamId);
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const mockStore = {
  bootstrap(user: User): AppBootstrap {
    const data = readBootstrap();
    return {
      ...data,
      tasks: visibleTasksFor(user, data.tasks),
    };
  },

  listTasks(user: User, teamId?: string) {
    const data = readBootstrap();
    let tasks = visibleTasksFor(user, data.tasks);
    if (teamId && teamId !== "all") {
      tasks = tasks.filter((task) => task.teamId === teamId);
    }
    return tasks;
  },

  getTask(user: User, taskId: string) {
    const task = this.listTasks(user).find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Task not found or not visible for this user.");
    }
    return task;
  },

  createTask(user: User, input: CreateTaskInput) {
    if (user.role !== "manager") {
      throw new Error("Only managers can create tasks.");
    }

    const data = readBootstrap();
    const createdAt = new Date().toISOString();
    const task: Task = {
      ...input,
      id: createId("task"),
      status: "todo",
      createdAt,
      updatedAt: createdAt,
      history: [
        {
          id: createId("history"),
          actorName: user.name,
          message: "Created task.",
          createdAt,
        },
      ],
    };
    data.tasks.unshift(task);
    writeBootstrap(data);
    return task;
  },

  updateTask(user: User, taskId: string, input: UpdateTaskInput) {
    const data = readBootstrap();
    const index = data.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) {
      throw new Error("Task not found.");
    }
    const existing = data.tasks[index];
    if (user.role !== "manager" && existing.assigneeId !== user.id) {
      throw new Error("You can only update tasks assigned to you.");
    }

    const updatedAt = new Date().toISOString();
    const history =
      input.status && input.status !== existing.status
        ? [
            ...(existing.history ?? []),
            {
              id: createId("history"),
              actorName: user.name,
              message: `Changed status to ${input.status.replace("_", " ")}.`,
              createdAt: updatedAt,
            },
          ]
        : existing.history;

    const updated: Task = { ...existing, ...input, updatedAt, history };
    data.tasks[index] = updated;
    writeBootstrap(data);
    return updated;
  },

  updateTaskStatus(user: User, taskId: string, status: TaskStatus) {
    return this.updateTask(user, taskId, { status });
  },

  deleteTask(user: User, taskId: string) {
    if (user.role !== "manager") {
      throw new Error("Only managers can delete tasks.");
    }

    const data = readBootstrap();
    data.tasks = data.tasks.filter((task) => task.id !== taskId);
    writeBootstrap(data);
    writeComments(readComments().filter((comment) => comment.taskId !== taskId));
  },

  setTaskImage(user: User, taskId: string, imageUrl?: string) {
    const task = this.getTask(user, taskId);
    if (user.role !== "manager" && task.assigneeId !== user.id) {
      throw new Error("You cannot update this attachment.");
    }
    return this.updateTask(user, taskId, { imageUrl });
  },

  listProjects(user: User) {
    const data = readBootstrap();
    if (user.role === "manager") {
      return data.projects;
    }
    return data.projects.filter((project) => !project.teamId || project.teamId === user.teamId);
  },

  createProject(user: User, input: CreateProjectInput) {
    if (user.role !== "manager") {
      throw new Error("Only managers can create projects.");
    }
    const data = readBootstrap();
    const now = new Date().toISOString();
    const project: Project = {
      ...input,
      id: createId("project"),
      createdAt: now,
      updatedAt: now,
    };
    data.projects.unshift(project);
    writeBootstrap(data);
    return project;
  },

  updateProject(user: User, projectId: string, input: CreateProjectInput) {
    if (user.role !== "manager") {
      throw new Error("Only managers can edit projects.");
    }
    const data = readBootstrap();
    const index = data.projects.findIndex((project) => project.id === projectId);
    if (index < 0) {
      throw new Error("Project not found.");
    }
    const project: Project = {
      ...data.projects[index],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    data.projects[index] = project;
    writeBootstrap(data);
    return project;
  },

  deleteProject(user: User, projectId: string) {
    if (user.role !== "manager") {
      throw new Error("Only managers can delete projects.");
    }
    const data = readBootstrap();
    data.projects = data.projects.filter((project) => project.id !== projectId);
    data.tasks = data.tasks.map((task) =>
      task.projectId === projectId ? { ...task, projectId: undefined } : task,
    );
    writeBootstrap(data);
  },

  listComments(user: User, taskId: string) {
    this.getTask(user, taskId);
    return readComments()
      .filter((comment) => comment.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  createComment(user: User, taskId: string, body: string) {
    this.getTask(user, taskId);
    const comments = readComments();
    const comment: TaskComment = {
      id: createId("comment"),
      taskId,
      authorId: user.id,
      body,
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    writeComments(comments);
    return comment;
  },
};
