"use client";

import { CheckCircle2, Clock3, Columns3, ListTodo, TimerReset } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamFilter } from "@/components/team-filter";
import type { Task, Team, User } from "@/lib/types";

export function Dashboard({
  tasks,
  teams,
  user,
  teamFilter,
  onTeamFilterChange,
  isLoading,
}: {
  tasks: Task[];
  teams: Team[];
  user: User;
  teamFilter: string;
  onTeamFilterChange: (value: string) => void;
  isLoading: boolean;
}) {
  const now = new Date();
  const visibleTasks =
    user.role === "manager" && teamFilter !== "all"
      ? tasks.filter((task) => task.teamId === teamFilter)
      : tasks;

  const metrics = [
    {
      label: "Total tasks",
      value: visibleTasks.length,
      icon: ListTodo,
      detail: user.role === "manager" ? "Company-wide workload" : "Your team workload",
    },
    {
      label: "In progress",
      value: visibleTasks.filter((task) => task.status === "in_progress").length,
      icon: Clock3,
      detail: "Currently being worked",
    },
    {
      label: "In review",
      value: visibleTasks.filter((task) => task.status === "in_review").length,
      icon: Columns3,
      detail: "Waiting for review",
    },
    {
      label: "Completed",
      value: visibleTasks.filter((task) => task.status === "done").length,
      icon: CheckCircle2,
      detail: "Marked done",
    },
    {
      label: "Overdue",
      value: visibleTasks.filter((task) => task.status !== "done" && new Date(task.deadline) < now).length,
      icon: TimerReset,
      detail: "Past deadline",
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {user.role === "manager"
              ? "Manager view across all teams and projects."
              : "Employee view scoped to your own team tasks."}
          </p>
        </div>
        {user.role === "manager" ? (
          <TeamFilter teams={teams} value={teamFilter} onChange={onTeamFilterChange} />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="bg-white">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm text-muted-foreground">{metric.label}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <p className="text-3xl font-semibold">{metric.value}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isLoading && visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center">
          <p className="font-medium">No tasks found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another team filter or create a new task.</p>
        </div>
      ) : null}
    </section>
  );
}
