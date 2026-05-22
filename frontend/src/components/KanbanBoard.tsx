import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Kanban,
  KanbanBoard as KanbanBoardContainer,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban";
import type { KanbanMoveEvent } from "@/components/reui/kanban";
import TaskDetailModal from "./TaskDetailModal";
import { Plus } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  deadline: string | null;
  assigneeId: string;
  teamId: string;
  projectId: string | null;
  imageKey: string | null;
  createdAt: string;
}

const COLUMNS = [
  { id: "TODO", label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "IN_REVIEW", label: "In Review" },
  { id: "DONE", label: "Done" },
] as const;

function formatPriority(p: string) {
  return p === "HIGH" ? "High" : p === "MEDIUM" ? "Medium" : "Low";
}

function TaskCard({ task, userMap, onClick }: { task: Task; userMap: Record<string, string>; onClick?: () => void }) {
  const priorityColor =
    task.priority === "HIGH"
      ? "bg-red-100 text-red-700"
      : task.priority === "MEDIUM"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  return (
    <Card
      onClick={onClick}
      className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <CardContent className="flex flex-col gap-2 p-3">
        <span className="text-sm font-medium">{task.title}</span>
        <div className="flex items-center justify-between">
          <Badge className={`text-xs ${priorityColor}`} variant="outline">
            {formatPriority(task.priority)}
          </Badge>
          <span className="text-xs text-muted-foreground truncate ml-2 max-w-[120px]">
            {userMap[task.assigneeId] || task.assigneeId.slice(0, 8)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KanbanBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [filterTeam, setFilterTeam] = useState<string>("");
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/tasks");
      setTasks(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    if (user?.role !== "manager") return;
    try {
      const data = await api.get("/teams");
      setTeams(data);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get("/users");
      const map: Record<string, string> = {};
      for (const u of data) map[u.userId] = u.email;
      setUserMap(map);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchTeams();
    fetchUsers();
  }, [fetchTasks, fetchTeams, fetchUsers]);

  const displayedTasks = tasks
    .filter((t) => !projectId || t.projectId === projectId)
    .filter((t) => !filterTeam || t.teamId === filterTeam);

  const grouped = {
    TODO: displayedTasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: displayedTasks.filter((t) => t.status === "IN_PROGRESS"),
    IN_REVIEW: displayedTasks.filter((t) => t.status === "IN_REVIEW"),
    DONE: displayedTasks.filter((t) => t.status === "DONE"),
  } as Record<string, Task[]>;

  function handleMove({
    event,
    activeContainer,
    overContainer,
  }: KanbanMoveEvent) {
    const taskId = event.active.id as string;
    if (!taskId || activeContainer === overContainer) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: overContainer as Task["status"] } : t,
      ),
    );
    api.put(`/tasks/${taskId}`, { status: overContainer }).catch(console.error);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 min-w-[260px] sm:min-w-0"
            >
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <div className="flex items-center gap-2">
          {user?.role === "manager" && (
            <Select
              value={filterTeam || "all"}
              onValueChange={(v) => setFilterTeam(!v || v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {user?.role === "manager" && (
            <Button
              onClick={() => {
                setSelectedTask(null);
                setModalOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" />
              New task
            </Button>
          )}
          {user?.role !== "manager" && (
            <span className="text-sm text-muted-foreground">
              Only managers can create tasks
            </span>
          )}
        </div>
      </div>

      <Kanban
        value={grouped}
        onValueChange={() => {}}
        getItemValue={(item) => item.id}
        onMove={handleMove}
      >
        <KanbanBoardContainer className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              value={col.id}
              disabled
              className="flex-1 min-w-[260px]"
            >
              <div className="flex items-center justify-between px-3 py-2">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <Badge variant="secondary">
                  {grouped[col.id]?.length ?? 0}
                </Badge>
              </div>
              <KanbanColumnContent
                value={col.id}
                className="flex-1 flex flex-col gap-2 p-2 min-h-[120px]"
              >
                {grouped[col.id]?.map((task) => (
                  <KanbanItem key={task.id} value={task.id}>
                    <KanbanItemHandle>
                      <TaskCard
                        task={task}
                        userMap={userMap}
                        onClick={() => {
                          setSelectedTask(task);
                          setModalOpen(true);
                        }}
                      />
                    </KanbanItemHandle>
                  </KanbanItem>
                ))}
              </KanbanColumnContent>
            </KanbanColumn>
          ))}
        </KanbanBoardContainer>
        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === "item") {
              const task = tasks.find((t) => t.id === value);
              return task ? <TaskCard task={task} userMap={userMap} /> : null;
            }
            return null;
          }}
        </KanbanOverlay>
      </Kanban>

      <TaskDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={selectedTask}
        onSaved={fetchTasks}
        teams={teams}
        projectId={projectId}
        userMap={userMap}
      />
    </div>
  );
}