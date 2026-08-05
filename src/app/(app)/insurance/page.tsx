"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Insurance now lives on each contract overview. Keep this route for old bookmarks. */
export default function InsurancePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/contracts");
  }, [router]);

  return (
    <div className="grid place-items-center py-24">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}
