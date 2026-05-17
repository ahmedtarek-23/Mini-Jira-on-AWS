"use client";

import * as React from "react";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { LoginScreen } from "@/components/auth/login-screen";
import { Dashboard } from "@/components/dashboard/dashboard";
import { AppShell, type AppView } from "@/components/layout/app-shell";
import { ProjectsPage } from "@/components/projects/projects-page";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";
import { TaskForm } from "@/components/tasks/task-form";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { AppBootstrap, Project, Task } from "@/lib/types";

function HomeContent() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeView, setActiveView] = React.useState<AppView>("dashboard");
  const [bootstrap, setBootstrap] = React.useState<AppBootstrap | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [teamFilter, setTeamFilter] = React.useState("all");
  const [taskFormOpen, setTaskFormOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);

  React.useEffect(() => {
    if (!user) {
      setBootstrap(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    api
      .bootstrap(user)
      .then((data) => {
        if (isMounted) {
          setBootstrap(data);
          setTeamFilter("all");
        }
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load workspace."))
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (isAuthLoading) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const tasks = bootstrap?.tasks ?? [];
  const teams = bootstrap?.teams ?? [];
  const users = bootstrap?.users ?? [];
  const projects = bootstrap?.projects ?? [];

  function setTasks(nextTasks: Task[]) {
    setBootstrap((current) => (current ? { ...current, tasks: nextTasks } : current));
  }

  function setProjects(nextProjects: Project[]) {
    setBootstrap((current) => (current ? { ...current, projects: nextProjects } : current));
  }

  function upsertTask(task: Task) {
    setTasks(tasks.some((item) => item.id === task.id) ? tasks.map((item) => (item.id === task.id ? task : item)) : [task, ...tasks]);
    setSelectedTask((current) => (current?.id === task.id ? task : current));
  }

  function handleTaskSaved(task: Task) {
    upsertTask(task);
    toast.success(editingTask ? "Task updated" : "Task created");
    setEditingTask(null);
  }

  function handleTaskDeleted(taskId: string) {
    setTasks(tasks.filter((task) => task.id !== taskId));
    setSelectedTask(null);
  }

  return (
    <AppShell
      activeView={activeView}
      onViewChange={setActiveView}
      onCreateTask={() => {
        setEditingTask(null);
        setTaskFormOpen(true);
      }}
      teams={teams}
    >
      {isLoading && !bootstrap ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {bootstrap && activeView === "dashboard" ? (
        <Dashboard
          tasks={tasks}
          teams={teams}
          user={user}
          teamFilter={teamFilter}
          onTeamFilterChange={setTeamFilter}
          isLoading={isLoading}
        />
      ) : null}

      {bootstrap && activeView === "board" ? (
        <KanbanBoard
          tasks={tasks}
          setTasks={setTasks}
          users={users}
          teams={teams}
          projects={projects}
          currentUser={user}
          teamFilter={teamFilter}
          onTeamFilterChange={setTeamFilter}
          onTaskClick={setSelectedTask}
        />
      ) : null}

      {bootstrap && activeView === "projects" ? (
        <ProjectsPage
          projects={projects}
          setProjects={setProjects}
          tasks={tasks}
          teams={teams}
          currentUser={user}
        />
      ) : null}

      <TaskForm
        open={taskFormOpen}
        onOpenChange={(open) => {
          setTaskFormOpen(open);
          if (!open) {
            setEditingTask(null);
          }
        }}
        currentUser={user}
        users={users}
        teams={teams}
        projects={projects}
        task={editingTask}
        onSaved={handleTaskSaved}
      />

      <TaskDetailModal
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTask(null);
          }
        }}
        currentUser={user}
        users={users}
        teams={teams}
        projects={projects}
        onTaskUpdated={upsertTask}
        onEdit={(task) => {
          setSelectedTask(null);
          setEditingTask(task);
          setTaskFormOpen(true);
        }}
        onDeleted={handleTaskDeleted}
      />
    </AppShell>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeContent />
    </AuthProvider>
  );
}
