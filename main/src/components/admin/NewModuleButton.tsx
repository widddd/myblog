"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";

export function NewModuleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const name = window.prompt("新模块名称", "自定义模块");
    if (!name?.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await adminJson<{ data: { id: number } }>(
        "/api/admin/modules",
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      router.push(`/admin/modules/${data.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "新建失败");
      setBusy(false);
    }
  }

  return (
    <button
      className="admin-btn"
      disabled={busy}
      onClick={() => void onClick()}
      type="button"
    >
      {busy ? "创建中…" : "新建模块"}
    </button>
  );
}
