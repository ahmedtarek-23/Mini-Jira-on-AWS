"use client";

import { BarChart3, FolderKanban, KanbanSquare, LogOut, Plus, Users } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import type { Team } from "@/lib/types";

export type AppView = "dashboard" | "board" | "projects";

export function AppShell({
  activeView,
  onViewChange,
  onCreateTask,
  teams,
  children,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onCreateTask: () => void;
  teams: Team[];
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const team = teams.find((item) => item.id === user?.teamId);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Mini-Jira on AWS</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.role === "manager" ? "Manager workspace" : `${team?.name ?? "Team"} workspace`}
              </p>
            </div>
          </div>

          <nav className="hidden items-center rounded-lg border bg-muted/50 p-1 md:flex">
            <NavButton icon={BarChart3} label="Dashboard" active={activeView === "dashboard"} onClick={() => onViewChange("dashboard")} />
            <NavButton icon={KanbanSquare} label="Board" active={activeView === "board"} onClick={() => onViewChange("board")} />
            <NavButton icon={FolderKanban} label="Projects" active={activeView === "projects"} onClick={() => onViewChange("projects")} />
          </nav>

          <div className="flex items-center gap-2">
            {user?.role === "manager" ? (
              <Button size="sm" onClick={onCreateTask}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New task</span>
              </Button>
            ) : null}
            <div className="hidden items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                {initials(user?.name ?? "")}
              </div>
              <div>
                <p className="text-xs font-medium">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground">{user?.role}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          <Button size="sm" variant={activeView === "dashboard" ? "default" : "outline"} onClick={() => onViewChange("dashboard")}>
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </Button>
          <Button size="sm" variant={activeView === "board" ? "default" : "outline"} onClick={() => onViewChange("board")}>
            <KanbanSquare className="h-4 w-4" />
            Board
          </Button>
          <Button size="sm" variant={activeView === "projects" ? "default" : "outline"} onClick={() => onViewChange("projects")}>
            <Users className="h-4 w-4" />
            Projects
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6">{children}</main>
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
