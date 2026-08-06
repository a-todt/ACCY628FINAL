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
import { useAuth } from "@/contexts/AuthContext";
import type { FavoriteProject } from "@/lib/projectFavorites";

const STORAGE_PREFIX = "gc_project_favorites_";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readFavorites(userId: string): FavoriteProject[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is FavoriteProject =>
          !!item &&
          typeof item === "object" &&
          typeof (item as FavoriteProject).id === "string" &&
          typeof (item as FavoriteProject).name === "string"
      )
      .map((item) => ({ id: item.id, name: item.name }));
  } catch {
    return [];
  }
}

function writeFavorites(userId: string, items: FavoriteProject[]) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
}

type ProjectFavoritesContextValue = {
  ready: boolean;
  favorites: FavoriteProject[];
  isFavorite: (projectId: string) => boolean;
  toggleFavorite: (project: FavoriteProject) => boolean;
  removeFavorite: (projectId: string) => void;
};

const ProjectFavoritesContext = createContext<ProjectFavoritesContextValue | null>(
  null
);

export function ProjectFavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteProject[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setReady(true);
      return;
    }
    setFavorites(readFavorites(user.id));
    setReady(true);
  }, [user]);

  const persist = useCallback(
    (next: FavoriteProject[]) => {
      if (!user) return;
      setFavorites(next);
      writeFavorites(user.id, next);
    },
    [user]
  );

  const favoriteIds = useMemo(
    () => new Set(favorites.map((item) => item.id)),
    [favorites]
  );

  const isFavorite = useCallback(
    (projectId: string) => favoriteIds.has(projectId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    (project: FavoriteProject) => {
      if (!user) return false;
      const exists = favorites.some((f) => f.id === project.id);
      if (exists) {
        persist(favorites.filter((f) => f.id !== project.id));
        return false;
      }
      persist([
        ...favorites.filter((f) => f.id !== project.id),
        { id: project.id, name: project.name },
      ]);
      return true;
    },
    [user, favorites, persist]
  );

  const removeFavorite = useCallback(
    (projectId: string) => {
      persist(favorites.filter((f) => f.id !== projectId));
    },
    [favorites, persist]
  );

  const value = useMemo(
    () => ({ ready, favorites, isFavorite, toggleFavorite, removeFavorite }),
    [ready, favorites, isFavorite, toggleFavorite, removeFavorite]
  );

  return (
    <ProjectFavoritesContext.Provider value={value}>
      {children}
    </ProjectFavoritesContext.Provider>
  );
}

export function useProjectFavorites() {
  const ctx = useContext(ProjectFavoritesContext);
  if (!ctx) {
    throw new Error("useProjectFavorites must be used within ProjectFavoritesProvider");
  }
  return ctx;
}
