"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fetchCsrfToken } from "@/lib/client/csrf";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    setSubmitting(true);

    try {
      const token = await fetchCsrfToken();
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": token,
        },
      });

      if (!response.ok) {
        throw new Error("退出登录失败");
      }

      router.replace("/admin/login");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "退出登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        className="heo-button heo-button--ghost"
        type="button"
        onClick={logout}
        disabled={submitting}
      >
        {submitting ? "退出中…" : "退出登录"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
