"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile, UserRole } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  previewRole: UserRole | null;
  effectiveRole: UserRole;
  setPreviewRole: (role: UserRole | null) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewRole, setPreviewRoleState] = useState<UserRole | null>(null);

  const loadProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as UserProfile) ?? null);
    },
    [supabase]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfile(user.id);
  }, [loadProfile, user]);

  useEffect(() => {
    const stored = window.localStorage.getItem("gc_preview_role");
    if (stored) setPreviewRoleState(stored as UserRole);

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) {
        loadProfile(data.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        loadProfile(nextUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile, supabase]);

  const setPreviewRole = (role: UserRole | null) => {
    setPreviewRoleState(role);
    if (role) window.localStorage.setItem("gc_preview_role", role);
    else window.localStorage.removeItem("gc_preview_role");
  };

  const signOut = async () => {
    setPreviewRole(null);
    await supabase.auth.signOut();
  };

  const effectiveRole: UserRole =
    previewRole ?? profile?.role ?? "field_supervisor";

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    previewRole,
    effectiveRole,
    setPreviewRole,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
