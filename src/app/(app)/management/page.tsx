"use client";

import { Suspense } from "react";
import ManagementPage from "./ManagementClient";

export default function ManagementRoute() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-24">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      }
    >
      <ManagementPage />
    </Suspense>
  );
}
