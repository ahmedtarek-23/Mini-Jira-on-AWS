import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Users, ListTodo, AlertCircle } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: string;
  teamId: string;
  deadline: string | null;
}

interface Team {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  DONE: "bg-green-100 text-green-700",
};

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status === "DONE") return false;
  return new Date(deadline) < new Date();
}

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tasksData, teamsData] = await Promise.all([
        api.get("/tasks"),
        api.get("/teams"),
      ]);
      const filtered = projectId ? tasksData.filter((t: any) => t.projectId === projectId) : tasksData;
      setTasks(filtered);
      setTeams(teamsData);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const teamStats = teams.map((team) => {
    const teamTasks = tasks.filter((t) => t.teamId === team.id);
    const byStatus: Record<string, number> = {};
    for (const t of teamTasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    }
    const overdueCount = teamTasks.filter((t) => isOverdue(t.deadline, t.status)).length;
    return { ...team, total: teamTasks.length, byStatus, overdueCount };
  });

  const totalTasks = tasks.length;
  const totalOverdue = tasks.filter((t) => isOverdue(t.deadline, t.status)).length;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{projectId ? "Project Dashboard" : "Dashboard"}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ListTodo className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{teams.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <BarChart className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Avg per Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {teams.length ? Math.round(totalTasks / teams.length) : 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertCircle className="size-4 text-destructive" />
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${totalOverdue > 0 ? "text-destructive" : ""}`}>
              {totalOverdue}
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold">Per-Team Breakdown</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {teamStats.map((team) => (
          <Card key={team.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{team.name}</span>
                {team.overdueCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {team.overdueCount} overdue
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{team.total}</span>
                <span className="text-sm text-muted-foreground">tasks</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <Badge key={key} className={`text-xs ${STATUS_COLORS[key] || ""}`} variant="outline">
                    {label}: {team.byStatus[key] || 0}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
