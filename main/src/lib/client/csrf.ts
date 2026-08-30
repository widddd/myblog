type CsrfResponse = {
  token?: string;
  message?: string;
};

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const body = (await response.json()) as CsrfResponse;
  if (!response.ok || !body.token) {
    throw new Error(body.message || "无法获取安全令牌");
  }
  return body.token;
}
