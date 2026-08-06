"use client";

import { Star } from "lucide-react";
import { useProjectFavorites } from "@/hooks/useProjectFavorites";
import { useToast } from "@/components/ToastProvider";

type FavoriteProjectButtonProps = {
  projectId: string;
  projectName: string;
  className?: string;
  size?: "xs" | "sm";
};

export function FavoriteProjectButton({
  projectId,
  projectName,
  className = "",
  size = "xs",
}: FavoriteProjectButtonProps) {
  const { isFavorite, toggleFavorite } = useProjectFavorites();
  const { toast } = useToast();
  const pinned = isFavorite(projectId);
  const btnSize = size === "sm" ? "btn-sm" : "btn-xs";

  return (
    <button
      type="button"
      className={`btn btn-ghost ${btnSize} btn-square ${
        pinned ? "text-warning" : "opacity-40 hover:opacity-100"
      } ${className}`}
      aria-label={
        pinned ? `Remove ${projectName} from favorites` : `Favorite ${projectName}`
      }
      aria-pressed={pinned}
      title={pinned ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = toggleFavorite({ id: projectId, name: projectName });
        toast(
          added
            ? `Added ${projectName} to favorites`
            : `Removed ${projectName} from favorites`,
          "success"
        );
      }}
    >
      <Star className={`h-4 w-4 ${pinned ? "fill-current" : ""}`} />
    </button>
  );
}
