"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  loginDemo: (userId: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);
const storageKey = "mini-jira-current-user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function hydrate() {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setIsLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(stored) as User;
        const current = await api.currentUser(parsed);
        setUser(current);
      } catch (error) {
        window.localStorage.removeItem(storageKey);
        toast.error(error instanceof Error ? error.message : "Could not restore session.");
      } finally {
        setIsLoading(false);
      }
    }

    void hydrate();
  }, []);

  async function loginDemo(userId: string) {
    setIsLoading(true);
    try {
      const nextUser = await api.loginDemo(userId);
      setUser(nextUser);
      window.localStorage.setItem(storageKey, JSON.stringify(nextUser));
      toast.success(`Logged in as ${nextUser.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    setUser(null);
    window.localStorage.removeItem(storageKey);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, loginDemo, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
