import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs sm:text-sm opacity-70">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1 min-w-0">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" /> : null}
              {item.href && !last ? (
                <Link href={item.href} className="link link-hover truncate max-w-[12rem]">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`truncate max-w-[16rem] ${last ? "font-medium text-base-content opacity-100" : ""}`}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
