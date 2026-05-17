"use client";

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { TeamFilter } from "@/components/team-filter";
import { KanbanColumn } from "@/components/tasks/kanban-column";
import { taskStatuses } from "@/lib/constants";
import { api } from "@/lib/api";
import { canUpdateTaskStatus } from "@/lib/permissions";
import type { Project, Task, TaskStatus, Team, User } from "@/lib/types";

export function KanbanBoard({
  tasks,
  setTasks,
  users,
  teams,
  projects,
  currentUser,
  teamFilter,
  onTeamFilterChange,
  onTaskClick,
}: {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  users: User[];
  teams: Team[];
  projects: Project[];
  currentUser: User;
  teamFilter: string;
  onTeamFilterChange: (value: string) => void;
  onTaskClick: (task: Task) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const visibleTasks =
    currentUser.role === "manager" && teamFilter !== "all"
      ? tasks.filter((task) => task.teamId === teamFilter)
      : tasks;

  async function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const nextStatus = event.over?.id as TaskStatus | undefined;
    const task = tasks.find((item) => item.id === taskId);

    if (!task || !nextStatus || task.status === nextStatus) {
      return;
    }
    if (!canUpdateTaskStatus(currentUser, task)) {
      toast.error("You can only move tasks assigned to you.");
      return;
    }

    const previous = tasks;
    setTasks(tasks.map((item) => (item.id === taskId ? { ...item, status: nextStatus } : item)));

    try {
      const updated = await api.updateTaskStatus(currentUser, taskId, nextStatus);
      setTasks(previous.map((item) => (item.id === taskId ? updated : item)));
      toast.success("Task status updated");
    } catch (error) {
      setTasks(previous);
      toast.error(error instanceof Error ? error.message : "Could not update task status.");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Kanban Board</h2>
          <p className="text-sm text-muted-foreground">
            Drag assigned tasks between workflow states. Managers can inspect every team.
          </p>
        </div>
        {currentUser.role === "manager" ? (
          <TeamFilter teams={teams} value={teamFilter} onChange={onTeamFilterChange} />
        ) : null}
      </div>

      <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
        <div className="grid gap-4 xl:grid-cols-4">
          {taskStatuses.map((status) => (
            <KanbanColumn
              key={status.value}
              status={status.value}
              title={status.label}
              tasks={visibleTasks.filter((task) => task.status === status.value)}
              users={users}
              teams={teams}
              projects={projects}
              canDragTask={(task) => canUpdateTaskStatus(currentUser, task)}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
