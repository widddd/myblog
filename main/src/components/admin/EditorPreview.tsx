"use client";

import { useEffect, useState } from "react";

import { adminJson } from "@/lib/client/admin";

type EditorPreviewProps = {
  markdown: string;
};

type PreviewState = {
  markdown: string;
  html: string;
  error: string;
};

export function EditorPreview({ markdown }: EditorPreviewProps) {
  const [result, setResult] = useState<PreviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminJson<{ data: { html: string } }>("/api/admin/preview", {
      method: "POST",
      body: JSON.stringify({ content: markdown }),
    })
      .then((payload) => {
        if (!cancelled) {
          setResult({ markdown, html: payload.data.html, error: "" });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setResult({
            markdown,
            html: "",
            error: caught instanceof Error ? caught.message : "预览失败",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [markdown]);

  if (!result || result.markdown !== markdown) {
    return <p className="admin-editor-loading">正在生成预览…</p>;
  }
  if (result.error) {
    return (
      <p className="admin-error" role="alert">
        {result.error}
      </p>
    );
  }
  if (!result.html) {
    return <p className="admin-muted">正文为空。</p>;
  }

  return (
    <div
      className="post-content admin-editor-preview"
      // HTML comes from renderMdx → sanitize on the server.
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}
