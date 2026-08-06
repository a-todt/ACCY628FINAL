"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function openCreateStorageKey(pathname: string, param = "new") {
  return `gc_open_create:${pathname}:${param}`;
}

/**
 * When the URL includes `?new=1` (or sessionStorage was set for this path),
 * open the create UI once and strip the query so refresh does not reopen it.
 *
 * sessionStorage survives React Strict Mode remounts after the query is cleared.
 */
export function useOpenCreateFromQuery(
  canOpen: boolean,
  onOpen: () => void,
  param = "new"
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!canOpen) return;

    const key = openCreateStorageKey(pathname, param);
    const fromQuery = searchParams.get(param) === "1";

    if (fromQuery) {
      sessionStorage.setItem(key, "1");
    }

    if (sessionStorage.getItem(key) !== "1") return;

    // Defer past mount; keep the storage flag briefly so Strict Mode remount
    // can reopen after state reset.
    const openTimer = window.setTimeout(() => {
      onOpen();
    }, 0);

    const clearTimer = window.setTimeout(() => {
      sessionStorage.removeItem(key);
      if (searchParams.get(param) === "1") {
        const next = new URLSearchParams(searchParams.toString());
        next.delete(param);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    }, 500);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(clearTimer);
    };
  }, [canOpen, onOpen, param, pathname, router, searchParams]);
}
