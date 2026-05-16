"use client";

import { BriefcaseBusiness, Code2, Database, LockKeyhole } from "lucide-react";
import { demoUsers } from "@/lib/demo-data";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const userIcons = {
  "user-ali": BriefcaseBusiness,
  "user-sara": Code2,
  "user-omar": Database,
};

export function LoginScreen() {
  const { loginDemo, isLoading } = useAuth();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_35%),linear-gradient(180deg,#f8fafc,#eef6f4)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center gap-8">
        <div className="max-w-3xl">
          <Badge tone="blue" className="mb-4">
            University cloud computing project
          </Badge>
          <h1 className="text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Mini-Jira on AWS
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Demo-ready task management for managers and employees, with team-scoped visibility, Kanban
            workflows, comments, projects, and image attachments.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {demoUsers.map((demoUser) => {
            const Icon = userIcons[demoUser.id as keyof typeof userIcons] ?? LockKeyhole;
            return (
              <Card key={demoUser.id} className="border-slate-200 bg-white/90 shadow-soft">
                <CardHeader>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{demoUser.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{demoUser.title}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Role</span>
                    <Badge tone={demoUser.role === "manager" ? "blue" : "green"}>{demoUser.role}</Badge>
                  </div>
                  <Button className="w-full" disabled={isLoading} onClick={() => void loginDemo(demoUser.id)}>
                    Continue as {demoUser.name.split(" ")[0]}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
