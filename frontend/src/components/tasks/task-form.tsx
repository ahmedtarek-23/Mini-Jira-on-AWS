"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, fileToDataUrl } from "@/lib/api";
import { taskPriorities } from "@/lib/constants";
import { toIsoDate, formatDateInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form-controls";
import type { CreateTaskInput, Project, Task, Team, User } from "@/lib/types";

const taskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters."),
  description: z.string().min(8, "Description must be at least 8 characters."),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  deadline: z.string().min(1, "Deadline is required."),
  assigneeId: z.string().min(1, "Assignee is required."),
  teamId: z.string().min(1, "Team is required."),
  projectId: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

export function TaskForm({
  open,
  onOpenChange,
  currentUser,
  users,
  teams,
  projects,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: User;
  users: User[];
  teams: Team[];
  projects: Project[];
  task?: Task | null;
  onSaved: (task: Task) => void;
}) {
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isEditing = Boolean(task);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    values: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
      deadline: formatDateInput(task?.deadline ?? new Date().toISOString()),
      assigneeId: task?.assigneeId ?? users.find((user) => user.role === "employee")?.id ?? "",
      teamId: task?.teamId ?? teams[0]?.id ?? "",
      projectId: task?.projectId ?? "",
    },
  });

  const selectedTeamId = form.watch("teamId");
  const availableUsers = users.filter((user) => user.role === "employee" && user.teamId === selectedTeamId);
  const availableProjects = projects.filter((project) => !project.teamId || project.teamId === selectedTeamId);

  React.useEffect(() => {
    const selectedAssignee = form.getValues("assigneeId");
    if (availableUsers.length > 0 && !availableUsers.some((user) => user.id === selectedAssignee)) {
      form.setValue("assigneeId", availableUsers[0].id);
    }
  }, [availableUsers, form]);

  async function submit(values: TaskFormValues) {
    setIsSubmitting(true);
    try {
      const input: CreateTaskInput = {
        ...values,
        deadline: toIsoDate(values.deadline),
        projectId: values.projectId || undefined,
      };

      if (imageFile) {
        input.imageUrl = await fileToDataUrl(imageFile);
      }

      const saved = task
        ? await api.updateTask(currentUser, task.id, input)
        : await api.createTask(currentUser, input);
      onSaved(saved);
      onOpenChange(false);
      form.reset();
      setImageFile(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit task" : "Create task"}</DialogTitle>
          <DialogDescription>
            Managers can assign tasks across teams. Employees only see the task controls allowed to them.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} />
            <FieldError>{form.formState.errors.title?.message}</FieldError>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} />
            <FieldError>{form.formState.errors.description?.message}</FieldError>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" {...form.register("priority")}>
                {taskPriorities.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" {...form.register("deadline")} />
              <FieldError>{form.formState.errors.deadline?.message}</FieldError>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="teamId">Team</Label>
              <Select id="teamId" {...form.register("teamId")}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assigneeId">Assignee</Label>
              <Select id="assigneeId" {...form.register("assigneeId")}>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <FieldError>{form.formState.errors.assigneeId?.message}</FieldError>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="projectId">Project</Label>
              <Select id="projectId" {...form.register("projectId")}>
                <option value="">No project</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="image">Optional image attachment</Label>
              <Input id="image" type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
