export type Role = "manager" | "employee";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type Team = {
  id: string;
  name: string;
  color: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId?: string;
  title: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskHistoryEntry = {
  id: string;
  actorName: string;
  message: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  history?: TaskHistoryEntry[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type CreateTaskInput = {
  title: string;
  description: string;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  projectId?: string;
  imageUrl?: string;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

export type CreateProjectInput = {
  name: string;
  description: string;
  teamId?: string;
};

export type AppBootstrap = {
  tasks: Task[];
  teams: Team[];
  users: User[];
  projects: Project[];
};
