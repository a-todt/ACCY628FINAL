"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  favoritableNavItemsForRole,
  type FavoriteNavItem,
} from "@/lib/navFavorites";

const STORAGE_PREFIX = "gc_nav_favorites_";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readFavorites(userId: string): FavoriteNavItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is FavoriteNavItem =>
          !!item &&
          typeof item === "object" &&
          typeof (item as FavoriteNavItem).href === "string" &&
          typeof (item as FavoriteNavItem).label === "string"
      )
      .map((item) => ({ href: item.href, label: item.label }));
  } catch {
    return [];
  }
}

function writeFavorites(userId: string, items: FavoriteNavItem[]) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(items));
}

export function useNavFavorites() {
  const { user, effectiveRole } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteNavItem[]>([]);
  const [ready, setReady] = useState(false);

  const allowed = useMemo(
    () => favoritableNavItemsForRole(effectiveRole),
    [effectiveRole]
  );

  const allowedHrefs = useMemo(
    () => new Set(allowed.map((item) => item.href)),
    [allowed]
  );

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setReady(true);
      return;
    }
    setFavorites(readFavorites(user.id));
    setReady(true);
  }, [user]);

  const visibleFavorites = useMemo(
    () =>
      favorites
        .filter((item) => allowedHrefs.has(item.href))
        .map((item) => {
          const match = allowed.find((a) => a.href === item.href);
          return match ? { href: match.href, label: match.label } : item;
        }),
    [favorites, allowed, allowedHrefs]
  );

  const favoriteHrefs = useMemo(
    () => new Set(visibleFavorites.map((item) => item.href)),
    [visibleFavorites]
  );

  const persist = useCallback(
    (next: FavoriteNavItem[]) => {
      if (!user) return;
      setFavorites(next);
      writeFavorites(user.id, next);
    },
    [user]
  );

  const isFavorite = useCallback(
    (href: string) => favoriteHrefs.has(href),
    [favoriteHrefs]
  );

  const toggleFavorite = useCallback(
    (item: FavoriteNavItem) => {
      if (!user) return false;
      const exists = favorites.some((f) => f.href === item.href);
      if (exists) {
        persist(favorites.filter((f) => f.href !== item.href));
        return false;
      }
      const catalog = allowed.find((a) => a.href === item.href);
      persist([
        ...favorites.filter((f) => f.href !== item.href),
        { href: item.href, label: catalog?.label ?? item.label },
      ]);
      return true;
    },
    [user, favorites, persist, allowed]
  );

  const removeFavorite = useCallback(
    (href: string) => {
      persist(favorites.filter((f) => f.href !== href));
    },
    [favorites, persist]
  );

  return {
    ready,
    favorites: visibleFavorites,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    favoritableItems: allowed,
  };
}
