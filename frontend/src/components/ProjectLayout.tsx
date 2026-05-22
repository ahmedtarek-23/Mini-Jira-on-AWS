import { useState, useEffect } from "react";
import { Outlet, useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ListTodo, BarChart3 } from "lucide-react";

interface Project {
  id: string;
  name: string;
}

const SUB_NAV = [
  { path: "tasks", label: "Tasks", icon: ListTodo, roles: ["manager", "employee"] },
  { path: "dashboard", label: "Dashboard", icon: BarChart3, roles: ["manager"] },
];

export default function ProjectLayout() {
  const { user } = useAuth();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.get("/projects").then((projects: Project[]) => {
      const p = projects.find((pr) => pr.id === projectId);
      if (p) setProject(p);
    });
  }, [projectId]);

  const currentTab = location.pathname.endsWith("/dashboard") ? "dashboard" : "tasks";

  useEffect(() => {
    if (user?.role !== 'manager' && currentTab === 'dashboard') {
      navigate(`/projects/${projectId}/tasks`, { replace: true });
    }
  }, [user, currentTab, projectId, navigate]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1">
          <ArrowLeft className="size-4" />
          Projects
        </Button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{project?.name || projectId}</span>
      </div>

      <div className="flex items-center gap-1 border-b">
        {SUB_NAV.filter((item) => item.roles.includes(user?.role || 'employee')).map((item) => {
          const active = currentTab === item.path;
          return (
            <Button
              key={item.path}
              variant={active ? "secondary" : "ghost"}
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/${item.path}`)}
              className={cn("gap-1.5 rounded-b-none", active && "font-medium")}
            >
              <item.icon className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
