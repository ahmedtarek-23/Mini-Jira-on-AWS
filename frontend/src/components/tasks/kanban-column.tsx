"use client";

import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "@/components/tasks/task-card";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskStatus, Team, User } from "@/lib/types";

export function KanbanColumn({
  status,
  title,
  tasks,
  users,
  teams,
  projects,
  canDragTask,
  onTaskClick,
}: {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  users: User[];
  teams: Team[];
  projects: Project[];
  canDragTask: (task: Task) => boolean;
  onTaskClick: (task: Task) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[520px] flex-col rounded-lg border bg-slate-50/80 transition",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="task-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              users={users}
              teams={teams}
              projects={projects}
              draggable={canDragTask(task)}
              onClick={() => onTaskClick(task)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed bg-white/70 p-5 text-center text-sm text-muted-foreground">
            No tasks in this column
          </div>
        )}
      </div>
    </section>
  );
}
