import { fetchCsrfToken } from "@/lib/client/csrf";

type ErrorBody = {
  code?: string;
  message?: string;
};

export async function adminJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers.set("x-csrf-token", await fetchCsrfToken());
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as ErrorBody & T;
  if (!response.ok) {
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}
