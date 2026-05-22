import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FolderKanban, Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get("/projects");
      setProjects(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("/projects", { name: name.trim(), description: description.trim() });
      toast.success("Project created");
      setName("");
      setDescription("");
      setOpen(false);
      fetchProjects();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleEditStart(p: Project) {
    setEditProject(p);
    setEditName(p.name);
    setEditDescription(p.description);
    setEditOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project?")) return;
    try {
      await api.del(`/projects/${id}`);
      toast.success("Project deleted");
      fetchProjects();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleEditSave() {
    if (!editName.trim() || !editProject) return;
    setEditSaving(true);
    try {
      await api.put(`/projects/${editProject.id}`, { name: editName.trim(), description: editDescription.trim() });
      toast.success("Project updated");
      setEditOpen(false);
      setEditProject(null);
      fetchProjects();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        {user?.role === "manager" && (
          <>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4 mr-1" />
              New project
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="Project name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    placeholder="Optional description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreate} disabled={!name.trim() || saving}>
                  {saving ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <FolderKanban className="size-12" />
          <p className="text-sm">No projects yet</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/projects/${p.id}/tasks`)}
            >
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <div className="flex items-center gap-1">
                  {user?.role === "manager" && (
                    <>
                      <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); handleEditStart(p); }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {p.description || "No description"}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditProject(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Project name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Optional description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <Button onClick={handleEditSave} disabled={!editName.trim() || editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
