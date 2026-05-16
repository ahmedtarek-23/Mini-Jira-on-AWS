"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form-controls";
import type { CreateProjectInput, Project, Team } from "@/lib/types";

const projectSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters."),
  description: z.string().min(8, "Description must be at least 8 characters."),
  teamId: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export function ProjectForm({
  open,
  onOpenChange,
  teams,
  project,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  project?: Project | null;
  onSubmit: (input: CreateProjectInput) => Promise<void>;
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    values: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      teamId: project?.teamId ?? "",
    },
  });

  async function submit(values: ProjectFormValues) {
    await onSubmit({
      name: values.name,
      description: values.description,
      teamId: values.teamId || undefined,
    });
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "Create project"}</DialogTitle>
          <DialogDescription>Projects can be assigned to a team or shared across teams.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => void submit(values))}>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" {...form.register("name")} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" {...form.register("description")} />
            <FieldError>{form.formState.errors.description?.message}</FieldError>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-team">Team</Label>
            <Select id="project-team" {...form.register("teamId")}>
              <option value="">Shared</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <Save className="h-4 w-4" />
              {form.formState.isSubmitting ? "Saving..." : "Save project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
