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

const ID_TOKEN_KEY = "mini-jira-id-token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ID_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem(ID_TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(ID_TOKEN_KEY);
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!baseUrl) {
    throw new Error("No API base URL configured.");
  }

  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token && !options.skipAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
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

async function uploadImage(path: string, file: File): Promise<{ imageUrl: string }> {
  if (!baseUrl) {
    return { imageUrl: await fileToDataUrl(file) };
  }

  // Step 1: ask backend for a pre-signed S3 PUT URL
  const { uploadUrl, imageUrl } = await request<{ uploadUrl: string; imageUrl: string }>(path, {
    method: "POST",
    body: JSON.stringify({ contentType: file.type }),
  });

  // Step 2: upload directly to S3 (no auth header needed — pre-signed URL carries credentials)
  const s3Response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!s3Response.ok) {
    throw new Error("S3 upload failed.");
  }

  return { imageUrl };
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
  /** Real Cognito sign-in — calls POST /auth/signin, stores the idToken. */
  async signin(email: string, password: string): Promise<User> {
    const { idToken, accessToken } = await request<{
      idToken: string;
      accessToken: string;
      refreshToken: string;
    }>("/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });

    setStoredToken(idToken);

    // Store access token for /auth/me (Cognito GetUser requires it)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mini-jira-access-token", accessToken);
    }

    const user = await request<User>("/auth/me", {
      headers: { "x-access-token": accessToken },
    });

    return user;
  },

  /** Demo login — works in offline (no baseUrl) mode. */
  async loginDemo(userId: string): Promise<User> {
    if (baseUrl) {
      // When a real backend is present, map demo IDs to fake Cognito users
      const user = demoUsers.find((item) => item.id === userId);
      if (!user) throw new Error("Demo user not found.");
      return user;
    }

    const user = demoUsers.find((item) => item.id === userId);
    if (!user) throw new Error("Demo user not found.");
    return user;
  },

  async currentUser(): Promise<User | null> {
    const token = getStoredToken();
    if (!token) return null;
    if (!baseUrl) return null;

    const accessToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("mini-jira-access-token") || ""
        : "";

    return request<User>("/auth/me", {
      headers: { "x-access-token": accessToken },
    });
  },

  async bootstrap(user: User): Promise<AppBootstrap> {
    if (baseUrl) {
      return request<AppBootstrap>("/bootstrap");
    }
    return mockStore.bootstrap(user);
  },

  async listTasks(user: User, teamId?: string): Promise<Task[]> {
    if (baseUrl) {
      const search = teamId && teamId !== "all" ? `?teamId=${encodeURIComponent(teamId)}` : "";
      return request<Task[]>(`/tasks${search}`);
    }
    return mockStore.listTasks(user, teamId);
  },

  async getTask(user: User, taskId: string): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}`);
    }
    return mockStore.getTask(user, taskId);
  },

  async createTask(user: User, input: CreateTaskInput): Promise<Task> {
    if (baseUrl) {
      return request<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      });
    }
    return mockStore.createTask(user, input);
  },

  async updateTask(user: User, taskId: string, input: UpdateTaskInput): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    return mockStore.updateTask(user, taskId, input);
  },

  async deleteTask(user: User, taskId: string): Promise<void> {
    if (baseUrl) {
      return request<void>(`/tasks/${taskId}`, { method: "DELETE" });
    }
    return mockStore.deleteTask(user, taskId);
  },

  async updateTaskStatus(user: User, taskId: string, status: TaskStatus): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    }
    return mockStore.updateTaskStatus(user, taskId, status);
  },

  async uploadTaskImage(user: User, taskId: string, file: File): Promise<Task> {
    const { imageUrl } = await uploadImage(`/tasks/${taskId}/image`, file);
    if (baseUrl) {
      return this.getTask(user, taskId);
    }
    return mockStore.setTaskImage(user, taskId, imageUrl);
  },

  async replaceTaskImage(user: User, taskId: string, file: File): Promise<Task> {
    if (baseUrl) {
      const { imageUrl } = await uploadImage(`/tasks/${taskId}/image`, file);
      return this.updateTask(user, taskId, { imageUrl });
    }
    const imageUrl = await fileToDataUrl(file);
    return mockStore.setTaskImage(user, taskId, imageUrl);
  },

  async deleteTaskImage(user: User, taskId: string): Promise<Task> {
    if (baseUrl) {
      return request<Task>(`/tasks/${taskId}/image`, { method: "DELETE" });
    }
    return mockStore.setTaskImage(user, taskId, undefined);
  },

  async listProjects(user: User): Promise<Project[]> {
    if (baseUrl) {
      return request<Project[]>("/projects");
    }
    return mockStore.listProjects(user);
  },

  async createProject(user: User, input: CreateProjectInput): Promise<Project> {
    if (baseUrl) {
      return request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      });
    }
    return mockStore.createProject(user, input);
  },

  async updateProject(user: User, projectId: string, input: CreateProjectInput): Promise<Project> {
    if (baseUrl) {
      return request<Project>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    return mockStore.updateProject(user, projectId, input);
  },

  async deleteProject(user: User, projectId: string): Promise<void> {
    if (baseUrl) {
      return request<void>(`/projects/${projectId}`, { method: "DELETE" });
    }
    return mockStore.deleteProject(user, projectId);
  },

  async listComments(user: User, taskId: string): Promise<TaskComment[]> {
    if (baseUrl) {
      return request<TaskComment[]>(`/tasks/${taskId}/comments`);
    }
    return mockStore.listComments(user, taskId);
  },

  async createComment(user: User, taskId: string, body: string): Promise<TaskComment> {
    if (baseUrl) {
      return request<TaskComment>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    }
    return mockStore.createComment(user, taskId, body);
  },
};
