"use client";

import * as React from "react";
import { toast } from "sonner";
import { api, clearStoredToken, getStoredToken, setStoredToken } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  /** Real Cognito sign-in (email + password). Requires NEXT_PUBLIC_API_BASE_URL. */
  login: (email: string, password: string) => Promise<void>;
  /** Demo mode — picks a preset user without a real backend. */
  loginDemo: (userId: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);
const USER_KEY = "mini-jira-current-user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Rehydrate session on mount
  React.useEffect(() => {
    async function hydrate() {
      const token = getStoredToken();
      const stored = window.localStorage.getItem(USER_KEY);

      if (!token && !stored) {
        setIsLoading(false);
        return;
      }

      try {
        if (token) {
          // Real Cognito session — verify token is still valid
          const current = await api.currentUser();
          if (current) {
            setUser(current);
            window.localStorage.setItem(USER_KEY, JSON.stringify(current));
          } else {
            clearStoredToken();
            window.localStorage.removeItem(USER_KEY);
          }
        } else if (stored) {
          // Demo session
          setUser(JSON.parse(stored) as User);
        }
      } catch {
        clearStoredToken();
        window.localStorage.removeItem(USER_KEY);
      } finally {
        setIsLoading(false);
      }
    }

    void hydrate();
  }, []);

  /** Real Cognito sign-in */
  async function login(email: string, password: string) {
    setIsLoading(true);
    try {
      const nextUser = await api.signin(email, password);
      setUser(nextUser);
      window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      toast.success(`Welcome, ${nextUser.name}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed.");
      throw error; // re-throw so the form can show inline errors
    } finally {
      setIsLoading(false);
    }
  }

  /** Demo / offline mode */
  async function loginDemo(userId: string) {
    setIsLoading(true);
    try {
      const nextUser = await api.loginDemo(userId);
      setUser(nextUser);
      window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      toast.success(`Logged in as ${nextUser.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    clearStoredToken();
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem("mini-jira-access-token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
