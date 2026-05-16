"use client";

import { format } from "date-fns";
import { CalendarDays, ClipboardList, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommentThread } from "@/components/tasks/comment-thread";
import { ImageAttachmentUploader } from "@/components/tasks/image-attachment-uploader";
import { priorityCopy, statusCopy } from "@/lib/constants";
import { api } from "@/lib/api";
import { canManageAttachment, canManageTasks } from "@/lib/permissions";
import type { Project, Task, Team, User } from "@/lib/types";

const priorityTone = {
  low: "slate",
  medium: "blue",
  high: "amber",
  urgent: "red",
} as const;

export function TaskDetailModal({
  task,
  open,
  onOpenChange,
  currentUser,
  users,
  teams,
  projects,
  onTaskUpdated,
  onEdit,
  onDeleted,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: User;
  users: User[];
  teams: Team[];
  projects: Project[];
  onTaskUpdated: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}) {
  if (!task) {
    return null;
  }

  const activeTask = task;
  const assignee = users.find((user) => user.id === task.assigneeId);
  const team = teams.find((item) => item.id === task.teamId);
  const project = projects.find((item) => item.id === task.projectId);

  async function deleteTask() {
    try {
      await api.deleteTask(currentUser, activeTask.id);
      onDeleted(activeTask.id);
      onOpenChange(false);
      toast.success("Task deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete task.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>{project ? project.name : "No project linked"}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-2 text-sm font-semibold">Description</h4>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{task.description}</p>
            </div>

            <CommentThread taskId={task.id} currentUser={currentUser} users={users} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Task details</h4>
                <div className="flex items-center gap-1">
                  {canManageTasks(currentUser) ? (
                    <Button variant="ghost" size="icon" onClick={() => onEdit(task)} aria-label="Edit task">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {canManageTasks(currentUser) ? (
                    <ConfirmDelete
                      title="Delete task?"
                      description="This removes the task and its local demo comments."
                      onConfirm={() => void deleteTask()}
                    >
                      <Button variant="ghost" size="icon" aria-label="Delete task">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </ConfirmDelete>
                  ) : null}
                </div>
              </div>

              <dl className="space-y-3 text-sm">
                <InfoRow label="Status" value={<Badge tone="blue">{statusCopy[task.status]}</Badge>} />
                <InfoRow label="Priority" value={<Badge tone={priorityTone[task.priority]}>{priorityCopy[task.priority]}</Badge>} />
                <InfoRow
                  label="Deadline"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {format(new Date(task.deadline), "MMM d, yyyy")}
                    </span>
                  }
                />
                <InfoRow
                  label="Assignee"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                      {assignee?.name ?? "Unassigned"}
                    </span>
                  }
                />
                <InfoRow
                  label="Team"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: team?.color ?? "#64748b" }} />
                      {team?.name ?? "No team"}
                    </span>
                  }
                />
              </dl>
            </div>

            <ImageAttachmentUploader
              task={task}
              currentUser={currentUser}
              allowed={canManageAttachment(currentUser, task)}
              onTaskUpdated={onTaskUpdated}
            />

            <div className="rounded-lg border bg-white p-4">
              <h4 className="mb-3 text-sm font-semibold">Audit history</h4>
              {task.history && task.history.length > 0 ? (
                <div className="space-y-3">
                  {task.history.map((entry) => (
                    <div key={entry.id} className="flex gap-3 text-sm">
                      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p>{entry.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.actorName} · {format(new Date(entry.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No audit history available.</p>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
