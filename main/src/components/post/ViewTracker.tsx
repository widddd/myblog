"use client";

import { useEffect, useState } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

type ViewResponse = {
  data?: {
    views?: number;
  };
};

export function ViewTracker({
  initialViews,
  publicId,
}: {
  initialViews: number;
  publicId: string;
}) {
  const [views, setViews] = useState(initialViews);

  useEffect(() => {
    let active = true;

    async function recordView() {
      try {
        const csrfToken = await fetchCsrfToken();
        const response = await fetch(
          `/api/posts/${encodeURIComponent(publicId)}/view`,
          {
            method: "POST",
            headers: { "x-csrf-token": csrfToken },
          },
        );
        const body = (await response.json()) as ViewResponse;
        if (
          active &&
          response.ok &&
          typeof body.data?.views === "number"
        ) {
          setViews(body.data.views);
        }
      } catch {
        // View counting must never block reading.
      }
    }

    void recordView();
    return () => {
      active = false;
    };
  }, [publicId]);

  return <span>热度 {views}</span>;
}
