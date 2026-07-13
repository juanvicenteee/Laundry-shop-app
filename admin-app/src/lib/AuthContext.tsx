import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

import { supabase } from "./supabase";

export type StaffProfile = {
  id: string;
  display_name: string;
  role: "admin" | "operator";
};

type AuthState = {
  session: Session | null;
  profile: StaffProfile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const usernameEmail: Record<string, string> = {
  admin: "admin@bubblyfi.app",
  operator: "operator@bubblyfi.app"
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,role")
        .eq("id", userId)
        .single();

      if (!error && data && (data.role === "admin" || data.role === "operator")) {
        setProfile(data as StaffProfile);
      }
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(username: string, password: string) {
    const normalized = username.trim().toLowerCase();
    const email = usernameEmail[normalized] ?? (normalized.includes("@") ? normalized : "");
    if (!email) throw new Error("Use admin or operator as the username.");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
