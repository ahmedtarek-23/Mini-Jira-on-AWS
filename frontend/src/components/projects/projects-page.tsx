"use client";

import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ProjectForm } from "@/components/projects/project-form";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { canManageProjects } from "@/lib/permissions";
import type { CreateProjectInput, Project, Task, Team, User } from "@/lib/types";

export function ProjectsPage({
  projects,
  setProjects,
  tasks,
  teams,
  currentUser,
}: {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  tasks: Task[];
  teams: Team[];
  currentUser: User;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);
  const canManage = canManageProjects(currentUser);

  async function saveProject(input: CreateProjectInput) {
    try {
      if (editingProject) {
        const updated = await api.updateProject(currentUser, editingProject.id, input);
        setProjects(projects.map((project) => (project.id === updated.id ? updated : project)));
        toast.success("Project updated");
      } else {
        const created = await api.createProject(currentUser, input);
        setProjects([created, ...projects]);
        toast.success("Project created");
      }
      setEditingProject(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save project.");
      throw error;
    }
  }

  async function deleteProject(projectId: string) {
    try {
      await api.deleteProject(currentUser, projectId);
      setProjects(projects.filter((project) => project.id !== projectId));
      toast.success("Project deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project.");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Organize tasks by assignment project. Manager controls are available only to managers.
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setEditingProject(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New project
          </Button>
        ) : null}
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const team = teams.find((item) => item.id === project.teamId);
            const taskCount = tasks.filter((task) => task.projectId === project.id).length;
            return (
              <Card key={project.id} className="bg-white">
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <CardTitle>{project.name}</CardTitle>
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingProject(project);
                          setFormOpen(true);
                        }}
                        aria-label="Edit project"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        title="Delete project?"
                        description="Tasks linked to this project will remain, but the project link will be removed."
                        onConfirm={() => void deleteProject(project.id)}
                      >
                        <Button variant="ghost" size="icon" aria-label="Delete project">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </ConfirmDelete>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">{project.description}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="blue">{team?.name ?? "Shared"}</Badge>
                    <Badge tone="slate">{taskCount} tasks</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center">
          <p className="font-medium">No projects found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage ? "Create a project to group related work." : "No projects are visible for your team yet."}
          </p>
        </div>
      )}

      <ProjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        teams={teams}
        project={editingProject}
        onSubmit={saveProject}
      />
    </section>
  );
}
