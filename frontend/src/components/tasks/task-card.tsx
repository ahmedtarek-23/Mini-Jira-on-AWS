"use client";

import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { CalendarDays, Image as ImageIcon, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { priorityCopy } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Project, Task, Team, User } from "@/lib/types";

const priorityTone = {
  low: "slate",
  medium: "blue",
  high: "amber",
  urgent: "red",
} as const;

export function TaskCard({
  task,
  users,
  teams,
  projects,
  draggable,
  onClick,
}: {
  task: Task;
  users: User[];
  teams: Team[];
  projects: Project[];
  draggable: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable,
  });
  const assignee = users.find((user) => user.id === task.assigneeId);
  const team = teams.find((item) => item.id === task.teamId);
  const project = projects.find((item) => item.id === task.projectId);

  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={cn(
        "group w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md",
        isDragging && "z-50 cursor-grabbing opacity-80 shadow-soft",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-5">{task.title}</p>
          {project ? <p className="mt-1 truncate text-xs text-muted-foreground">{project.name}</p> : null}
        </div>
        <Badge tone={priorityTone[task.priority]}>{priorityCopy[task.priority]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
          <CalendarDays className="h-3.5 w-3.5" />
          {format(new Date(task.deadline), "MMM d")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
          <UserRound className="h-3.5 w-3.5" />
          {assignee?.name ?? "Unassigned"}
        </span>
        {task.imageUrl ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
            <ImageIcon className="h-3.5 w-3.5" />
            Image
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: team?.color ?? "#64748b" }} />
        {team?.name ?? "No team"}
      </div>
    </button>
  );
}
