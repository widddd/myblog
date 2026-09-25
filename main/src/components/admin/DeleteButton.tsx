"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminJson } from "@/lib/client/admin";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";

export function DeleteButton({
  url,
  label,
  confirmText,
}: {
  url: string;
  label?: string;
  confirmText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useAdminConfirm();

  async function onClick() {
    const message = confirmText.includes("无法恢复")
      ? confirmText
      : `${confirmText}\n删除后无法恢复。`;
    if (!(await confirm(message)) || busy) {
      return;
    }
    setBusy(true);
    try {
      await adminJson(url, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除失败");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="admin-btn admin-btn--danger"
        disabled={busy}
        onClick={() => void onClick()}
        type="button"
      >
        {busy ? "删除中..." : (label ?? "删除")}
      </button>
      {dialog}
    </>
  );
}
