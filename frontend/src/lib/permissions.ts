import type { Task, User } from "@/lib/types";

export function isManager(user: User | null) {
  return user?.role === "manager";
}

export function canManageTasks(user: User | null) {
  return isManager(user);
}

export function canManageProjects(user: User | null) {
  return isManager(user);
}

export function canUpdateTaskStatus(user: User | null, task: Task) {
  return Boolean(user && (user.role === "manager" || task.assigneeId === user.id));
}

export function canComment(user: User | null) {
  return Boolean(user);
}

export function canManageAttachment(user: User | null, task: Task) {
  return Boolean(user && (user.role === "manager" || task.assigneeId === user.id));
}
