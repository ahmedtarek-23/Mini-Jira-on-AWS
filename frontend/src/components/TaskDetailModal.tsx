import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Paperclip, ExternalLink, MessageSquare } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

interface Task {
  id?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline: string | null;
  assigneeId: string;
  teamId: string;
  projectId: string | null;
  imageKey: string | null;
}

interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  onSaved: () => void;
  teams: { id: string; name: string }[];
  projectId?: string;
  userMap?: Record<string, string>;
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

function getImageUrl(
  baseUrl: string,
  imageKey: string | null,
): string | null {
  if (!baseUrl || !imageKey) return null;
  return `${baseUrl}/${encodeURIComponent(imageKey)}`;
}

const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  deadline: z.string().optional().nullable(),
  assigneeId: z.string().min(1, "Assignee is required"),
  teamId: z.string().min(1, "Team is required"),
  projectId: z.string().nullable().optional(),
  imageKey: z.string().nullable().optional(),
});

function getStatusColor(status: string) {
  switch (status) {
    case "TODO":
      return "bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200";
    case "IN_REVIEW":
      return "bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200";
    case "DONE":
      return "bg-green-100 text-green-700 hover:bg-green-100 border-green-200";
    default:
      return "";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "HIGH":
      return "bg-red-100 text-red-700 hover:bg-red-100 border-red-200";
    case "MEDIUM":
      return "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200";
    case "LOW":
      return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200";
    default:
      return "";
  }
}

export default function TaskDetailModal({
  open,
  onOpenChange,
  task,
  onSaved,
  teams,
  projectId,
  userMap = {},
}: Props) {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const isNew = !task?.id;

  const [form, setForm] = useState<Task>({
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    deadline: "",
    assigneeId: "",
    teamId: "",
    projectId: null,
    imageKey: null,
  });
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ userId: string; email: string }[]>([]);
  const [resizedBucketUrl, setResizedBucketUrl] = useState("");
  const [originalsBucketUrl, setOriginalsBucketUrl] = useState("");
  const [allUsers, setAllUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && task) {
      setForm({
        ...task,
        deadline: task.deadline ? task.deadline.slice(0, 10) : "",
      });
      if (task.assigneeId) {
        setUsers([{ userId: task.assigneeId, email: task.assigneeId }]);
      }
      fetchUsers(task.teamId);
      fetchComments();
    } else if (open && !task) {
      setForm({
        title: "",
        description: "",
        status: "TODO",
        priority: "MEDIUM",
        deadline: "",
        assigneeId: "",
        teamId: "",
        projectId: projectId || null,
        imageKey: null,
      });
      setUsers([]);
    }
  }, [open, task]);

  const fetchAllUsers = useCallback(async () => {
    try {
      const data = await api.get("/users");
      const map: Record<string, string> = {};
      for (const u of data) map[u.userId] = u.email;
      setAllUsers(map);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchComments = useCallback(async () => {
    if (!task?.id) return;
    try {
      const data = await api.get(`/comments?taskId=${task.id}`);
      setComments(data);
    } catch (e: any) {
      console.error(e);
    }
  }, [task]);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get("/projects");
      setProjects(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchBucketUrls = useCallback(async () => {
    try {
      const data = await api.get("/uploads/buckets");
      setOriginalsBucketUrl(data.originals);
      setResizedBucketUrl(data.resized);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchUsers = useCallback(async (teamId: string) => {
    if (!teamId) {
      setUsers([]);
      return;
    }
    try {
      const data = await api.get(`/users?teamId=${teamId}`);
      setUsers((prev) => {
        const merged = [...data];
        const existingIds = new Set(merged.map((u) => u.userId));
        for (const u of prev) {
          if (!existingIds.has(u.userId)) {
            merged.push(u);
          }
        }
        return merged;
      });
    } catch (e) {
      console.error(e);
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProjects();
      fetchBucketUrls();
      fetchAllUsers();
    }
  }, [open, fetchProjects, fetchBucketUrls, fetchAllUsers]);

  useEffect(() => {
    if (open && form.teamId && form.teamId !== (task?.teamId || "")) {
      fetchUsers(form.teamId);
    }
  }, [open, form.teamId, fetchUsers, task]);

  function getUserName(userId: string) {
    return allUsers[userId] || userMap[userId] || userId.slice(0, 12);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const parse = taskSchema.safeParse(form);
      if (!parse.success) {
        const first = parse.error.issues[0];
        toast.error(first?.message || "Invalid form");
        setSaving(false);
        return;
      }
      let imageKey = form.imageKey;
      if (file) {
        const s3Key = `tasks/${crypto.randomUUID()}-${file.name}`;
        const { url } = await api.post("/uploads/presigned", {
          key: s3Key,
          contentType: file.type,
        });
        await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        imageKey = s3Key;
      }
      const payload = { ...form, imageKey };
      if (isNew) {
        await api.post("/tasks", payload);
        toast.success("Task created");
      } else {
        await api.put(`/tasks/${task!.id}`, payload);
        toast.success("Task updated");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment() {
    if (!commentText.trim() || !task?.id) return;
    try {
      await api.post("/comments", { taskId: task.id, text: commentText });
      setCommentText("");
      fetchComments();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function updateField<K extends keyof Task>(field: K, value: Task[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const canEditAll = isManager || isNew;
  const canEditStatus =
    !isManager && task?.id && user?.userId === task.assigneeId;

  const imageUrl = getImageUrl(resizedBucketUrl, form.imageKey);
  const fullImageUrl = getImageUrl(originalsBucketUrl, form.imageKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] md:max-w-2xl lg:max-w-3xl xl:max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl font-semibold">
              {isNew ? "Create New Task" : "Task Details"}
            </DialogTitle>
            {!isNew && (
              <>
                <Badge
                  variant="outline"
                  className={getStatusColor(form.status)}
                >
                  {STATUS_LABELS[form.status] || form.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={getPriorityColor(form.priority)}
                >
                  {PRIORITY_LABELS[form.priority] || form.priority}
                </Badge>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
          <div className="flex flex-col gap-8 py-2">
            {/* Title & Description */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  disabled={!canEditAll}
                  placeholder="Enter task title..."
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  disabled={!canEditAll}
                  placeholder="Describe the task..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Two-column fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => updateField("priority", v || "MEDIUM")}
                  disabled={!canEditAll}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => updateField("status", v || "TODO")}
                  disabled={!canEditAll && !canEditStatus}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">To Do</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="IN_REVIEW">In Review</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Deadline</Label>
                <DatePicker
                  value={form.deadline}
                  onChange={(v) => updateField("deadline", v)}
                  disabled={!canEditAll}
                  placeholder="Pick a deadline"
                />
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Assignee</Label>
                <Select
                  value={form.assigneeId || ""}
                  onValueChange={(v) => updateField("assigneeId", v || "")}
                  disabled={!canEditAll || !form.teamId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        form.teamId ? "Select assignee" : "Select a team first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Team</Label>
                <Select
                  value={form.teamId || ""}
                  onValueChange={(v) => updateField("teamId", v || "")}
                  disabled={!canEditAll}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Project</Label>
                <Select
                  value={form.projectId ?? ""}
                  onValueChange={(v) => updateField("projectId", v || null)}
                  disabled={!canEditAll}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Attachment */}
            {canEditAll && (
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium">Attachment</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            )}

            {/* Image Preview */}
            {imageUrl && (
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Image Attachment
                </Label>
                <Card className="overflow-hidden w-full">
                  <a
                    href={fullImageUrl || ""}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block relative group"
                  >
                    <img
                      src={imageUrl}
                      alt="Task attachment"
                      className="w-full h-auto max-h-[400px] object-contain rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center rounded-lg">
                      <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </a>
                  <CardContent className="py-2 px-3 flex items-center justify-between">
                    <a
                      href={fullImageUrl || ""}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View original
                    </a>
                    {canEditAll && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateField("imageKey", null);
                          setFile(null);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Comments */}
            {!isNew && (
              <>
                <Separator />
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">
                      Comments ({comments.length})
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                    >
                      Post
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {comments.map((c) => (
                      <Card key={c.id} className="shadow-none">
                        <CardContent className="p-3 flex gap-3">
                          <Avatar size="sm">
                            <AvatarFallback className="text-xs">
                              {getUserName(c.authorId).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground truncate">
                                {getUserName(c.authorId)}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm break-words">{c.text}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No comments yet. Be the first to comment!
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {(canEditAll || canEditStatus) && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}