import { demoUsers } from "@/lib/demo-data";
import { mockStore } from "@/lib/mock-store";
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

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

type RequestOptions = RequestInit & {
  user?: User | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!baseUrl) {
    throw new Error("No API base URL configured.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.user ? { "X-Demo-User-Id": options.user.id } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function uploadImage(path: string, file: File, user: User): Promise<{ imageUrl: string }> {
  if (!baseUrl) {
    return {
      imageUrl: await fileToDataUrl(file),
    };
  }

  const formData = new FormData();
  formData.append("image", file);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "X-Demo-User-Id": user.id,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Image upload failed.");
  }

  return (await response.json()) as { imageUrl: string };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

export const api = {
  async loginDemo(userId: string): Promise<User> {
    if (baseUrl) {
      return request<User>("/auth/demo-login", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    }

    const user = demoUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error("Demo user not found.");
    }
    return user;
  },

  async currentUser(user: User | null): Promise<User | null> {
    if (!user) {
      return null;
    }
    if (baseUrl) {
      return request<User>("/auth/me", { user });
    }
    return user;
  },

  async bootstrap(user: User): Promise<AppBootstrap> {
    if (baseUrl) {
      return request<AppBootstrap>("/bootstrap", { user });
    }
    return mockStore.bootstrap(user);
  },

  async listTasks(user: User, teamId?: string): Promise<Task[]> {
    if (baseUrl) {
      const search = teamId && teamId !== "all" ? `?teamId=${encodeURIComponent(teamId)}` : "";
      return request<Task[]>(`/tasks${search}`, { user });
    }
    return mockStore.listTasks(user, teamId);
  },

  async getTask(user: User, taskId: string): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}`, { user });
    }
    return mockStore.getTask(user, taskId);
  },

  async createTask(user: User, input: CreateTaskInput): Promise<Task> {
    if (baseUrl) {
      return request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
        user,
      });
    }
    return mockStore.createTask(user, input);
  },

  async updateTask(user: User, taskId: string, input: UpdateTaskInput): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
        user,
      });
    }
    return mockStore.updateTask(user, taskId, input);
  },

  async deleteTask(user: User, taskId: string): Promise<void> {
    if (baseUrl) {
      return request<void>(`/tasks/${taskId}`, { method: "DELETE", user });
    }
    return mockStore.deleteTask(user, taskId);
  },

  async updateTaskStatus(user: User, taskId: string, status: TaskStatus): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        user,
      });
    }
    return mockStore.updateTaskStatus(user, taskId, status);
  },

  async uploadTaskImage(user: User, taskId: string, file: File): Promise<Task> {
    const { imageUrl } = await uploadImage(`/tasks/${taskId}/image`, file, user);
    if (baseUrl) {
      return this.getTask(user, taskId);
    }
    return mockStore.setTaskImage(user, taskId, imageUrl);
  },

  async replaceTaskImage(user: User, taskId: string, file: File): Promise<Task> {
    if (baseUrl) {
      const { imageUrl } = await uploadImage(`/tasks/${taskId}/image`, file, user);
      return this.updateTask(user, taskId, { imageUrl });
    }
    const imageUrl = await fileToDataUrl(file);
    return mockStore.setTaskImage(user, taskId, imageUrl);
  },

  async deleteTaskImage(user: User, taskId: string): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}/image`, { method: "DELETE", user });
    }
    return mockStore.setTaskImage(user, taskId, undefined);
  },

  async listProjects(user: User): Promise<Project[]> {
    if (baseUrl) {
      return request<Project[]>("/projects", { user });
    }
    return mockStore.listProjects(user);
  },

  async createProject(user: User, input: CreateProjectInput): Promise<Project> {
    if (baseUrl) {
      return request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
        user,
      });
    }
    return mockStore.createProject(user, input);
  },

  async updateProject(user: User, projectId: string, input: CreateProjectInput): Promise<Project> {
    if (baseUrl) {
      return request<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
        user,
      });
    }
    return mockStore.updateProject(user, projectId, input);
  },

  async deleteProject(user: User, projectId: string): Promise<void> {
    if (baseUrl) {
      return request<void>(`/projects/${projectId}`, { method: "DELETE", user });
    }
    return mockStore.deleteProject(user, projectId);
  },

  async listComments(user: User, taskId: string): Promise<TaskComment[]> {
    if (baseUrl) {
      return request<TaskComment[]>(`/tasks/${taskId}/comments`, { user });
    }
    return mockStore.listComments(user, taskId);
  },

  async createComment(user: User, taskId: string, body: string): Promise<TaskComment> {
    if (baseUrl) {
      return request<TaskComment>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
        user,
      });
    }
    return mockStore.createComment(user, taskId, body);
  },
};
