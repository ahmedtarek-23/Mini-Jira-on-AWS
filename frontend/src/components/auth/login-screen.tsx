"use client";

import * as React from "react";
import { BriefcaseBusiness, Code2, Database, LockKeyhole, LogIn } from "lucide-react";
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

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export function LoginScreen() {
  const { login, loginDemo, isLoading } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [authError, setAuthError] = React.useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      await login(email, password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_35%),linear-gradient(180deg,#f8fafc,#eef6f4)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center gap-10">

        {/* Header */}
        <div className="max-w-3xl">
          <Badge tone="blue" className="mb-4">University cloud computing project</Badge>
          <h1 className="text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Mini-Jira on AWS
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Team task management with Kanban workflows, role-based access, and event-driven AWS services.
          </p>
        </div>

        {/* Real Cognito sign-in — only shown when a backend URL is configured */}
        {baseUrl && (
          <div className="max-w-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Sign in with Cognito</h2>
            <form onSubmit={(e) => void handleSignIn(e)} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                <LogIn className="mr-2 h-4 w-4" />
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </div>
        )}

        {/* Demo user cards — always visible */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-800">
            {baseUrl ? "Or continue in demo mode" : "Choose a demo account"}
          </h2>
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
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={isLoading}
                      onClick={() => void loginDemo(demoUser.id)}
                    >
                      Continue as {demoUser.name.split(" ")[0]}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

      </div>
    </main>
  );
}
