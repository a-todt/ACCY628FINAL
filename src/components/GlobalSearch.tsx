"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContractData } from "@/hooks/useContractData";
import {
  buildSearchIndex,
  filterSearchResults,
  groupSearchResults,
  type SearchResult,
} from "@/lib/globalSearch";

export function GlobalSearch() {
  const router = useRouter();
  const { effectiveRole } = useAuth();
  const data = useContractData();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const index = useMemo(() => {
    if (data.loading) return [];
    return buildSearchIndex(
      {
        contracts: data.contracts,
        invoices: data.invoices,
        subcontractors: data.subcontractors,
        changeOrders: data.changeOrders,
        fieldLogs: data.fieldLogs,
        userProfiles: data.userProfiles,
      },
      effectiveRole
    );
  }, [
    data.loading,
    data.contracts,
    data.invoices,
    data.subcontractors,
    data.changeOrders,
    data.fieldLogs,
    data.userProfiles,
    effectiveRole,
  ]);

  const results = useMemo(() => filterSearchResults(index, query), [index, query]);
  const groups = useMemo(() => groupSearchResults(results), [results]);
  const flatResults = results;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const goToResult = (result: SearchResult) => {
    setQuery("");
    setOpen(false);
    router.push(result.href);
  };

  const onKeyDownInput = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(flatResults.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = flatResults[activeIndex] ?? flatResults[0];
      if (target) goToResult(target);
    }
  };

  const showDropdown = open;
  const trimmed = query.trim();

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0 max-w-xl mx-1 sm:mx-2">
      <label className="input input-sm input-bordered flex items-center gap-2 bg-base-200/60 w-full min-h-9 h-9">
        <Search className="h-4 w-4 opacity-50 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className="grow min-w-0 bg-transparent outline-none text-sm"
          placeholder="Search contracts, invoices, people…"
          value={query}
          aria-label="Global search"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          role="combobox"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDownInput}
        />
      </label>

      {showDropdown ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-[min(24rem,70vh)] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-xl"
        >
          {data.loading ? (
            <div className="px-3 py-8 grid place-items-center">
              <span className="loading loading-spinner loading-sm text-primary" />
            </div>
          ) : !trimmed ? (
            <p className="px-3 py-6 text-sm opacity-60 text-center">
              Start typing to search contracts, invoices, people, and more.
            </p>
          ) : flatResults.length === 0 ? (
            <p className="px-3 py-6 text-sm opacity-60 text-center">No matches for “{trimmed}”.</p>
          ) : (
            <div className="py-1">
              {groups.map((group) => (
                <div key={group.type} className="pb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide font-semibold opacity-50">
                    {group.label}
                  </p>
                  <ul>
                    {group.items.map((item) => {
                      const flatIndex = flatResults.findIndex((r) => r.id === item.id);
                      const active = flatIndex === activeIndex;
                      return (
                        <li key={item.id} role="option" aria-selected={active}>
                          <button
                            type="button"
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              active ? "bg-primary/10" : "hover:bg-base-200/70"
                            }`}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onClick={() => goToResult(item)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{item.title}</p>
                                {item.subtitle ? (
                                  <p className="text-xs opacity-60 truncate">{item.subtitle}</p>
                                ) : null}
                              </div>
                              <span className="badge badge-ghost badge-sm shrink-0 capitalize">
                                {group.label.replace(/s$/, "")}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
