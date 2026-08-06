"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useNavFavorites } from "@/hooks/useNavFavorites";
import { useToast } from "@/components/ToastProvider";
import { AlertBanner, EmptyState, PageHeader, SectionCard } from "@/components/ui";

export default function FavoritesPage() {
  const { favorites, favoritableItems, isFavorite, toggleFavorite, ready } =
    useNavFavorites();
  const { toast } = useToast();

  if (!ready) {
    return (
      <div className="grid place-items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Favorites"
        subtitle="Pin the tabs you use most. Star any page from the secondary nav, or manage them here."
      />

      {favorites.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          message="Open any section (Contracts, Costing, Subcontracting…) and click the star next to a tab to pin it here."
        />
      ) : (
        <SectionCard title="Your pinned tabs">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favorites.map((item) => (
              <div
                key={item.href}
                className="flex items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2.5"
              >
                <Link href={item.href} className="flex-1 font-medium link link-hover min-w-0 truncate">
                  {item.label}
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-square text-warning"
                  aria-label={`Unpin ${item.label}`}
                  onClick={() => {
                    toggleFavorite(item);
                    toast(`Removed ${item.label} from favorites`, "info");
                  }}
                >
                  <Star className="h-4 w-4 fill-current" />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Add favorites">
        <p className="text-sm opacity-70 mb-4">
          Click a star to pin or unpin a tab. Favorites stay on this device for your account.
        </p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {favoritableItems.map((item) => {
            const pinned = isFavorite(item.href);
            return (
              <li key={item.href}>
                <div className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2">
                  <Link href={item.href} className="flex-1 text-sm link link-hover truncate">
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    className={`btn btn-ghost btn-xs btn-square ${
                      pinned ? "text-warning" : "opacity-50 hover:opacity-100"
                    }`}
                    aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                    aria-pressed={pinned}
                    onClick={() => {
                      const added = toggleFavorite(item);
                      toast(
                        added
                          ? `Added ${item.label} to favorites`
                          : `Removed ${item.label} from favorites`,
                        "success"
                      );
                    }}
                  >
                    <Star className={`h-4 w-4 ${pinned ? "fill-current" : ""}`} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <AlertBanner type="info">
        Tip: you can also star tabs directly in the secondary nav bar under Contracts, Costing, and
        other sections.
      </AlertBanner>
    </div>
  );
}
