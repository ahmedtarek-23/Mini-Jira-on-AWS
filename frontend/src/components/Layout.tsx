import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  LogOut,
  User,
  FolderKanban,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/projects", label: "Projects", icon: FolderKanban, roles: ["manager", "employee"] },
  { path: "/teams", label: "Teams", icon: Users, roles: ["manager"] },
];

export default function Layout() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.roles.includes(user.role)
  );
  const isOnProjectPage = location.pathname === "/projects" || location.pathname.startsWith("/projects/");
  const isOnTeamsPage = location.pathname === "/teams";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="size-5" />
            <span className="font-semibold">Mini Jira</span>
          </div>
          {visibleItems.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <nav className="flex items-center gap-1">
                {visibleItems.map((item) => {
                  const active = item.path === "/projects"
                    ? isOnProjectPage
                    : item.path === "/teams"
                      ? isOnTeamsPage
                      : location.pathname === item.path;
                  return (
                    <Button
                      key={item.path}
                      variant={active ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => navigate(item.path)}
                      className={cn("gap-1.5", active && "font-medium")}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </nav>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground capitalize">
            {user.role}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <div className="relative flex size-8 items-center justify-center rounded-full">
                <Avatar className="size-8">
                  <AvatarFallback>{user.email[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-full">
              <DropdownMenuItem className="gap-2">
                <User className="size-4" />
                {user.email}
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                className="gap-2 text-destructive"
                onClick={logout}
              >
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
