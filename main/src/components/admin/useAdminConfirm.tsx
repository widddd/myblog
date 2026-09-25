"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { AdminDialog } from "@/components/admin/AdminDialog";

export function useAdminConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    message: string;
    resolve?: (ok: boolean) => void;
  }>({ open: false, message: "" });

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, message, resolve });
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setState((current) => {
      current.resolve?.(ok);
      return { open: false, message: "" };
    });
  }, []);

  const dialog: ReactNode = (
    <AdminDialog
      onClose={() => finish(false)}
      open={state.open}
      title="确认"
    >
      <p className="admin-dialog__lead">{state.message}</p>
      <div className="admin-btn-row">
        <button
          className="admin-btn admin-btn--ghost"
          onClick={() => finish(false)}
          type="button"
        >
          取消
        </button>
        <button
          className="admin-btn admin-btn--danger"
          onClick={() => finish(true)}
          type="button"
        >
          确定
        </button>
      </div>
    </AdminDialog>
  );

  return { confirm, dialog };
}

export function useAdminPrompt() {
  const [state, setState] = useState<{
    open: boolean;
    message: string;
    value: string;
    resolve?: (value: string | null) => void;
  }>({ open: false, message: "", value: "" });
  const valueRef = useRef("");

  const prompt = useCallback((message: string) => {
    valueRef.current = "";
    return new Promise<string | null>((resolve) => {
      setState({ open: true, message, value: "", resolve });
    });
  }, []);

  const finish = useCallback((value: string | null) => {
    setState((current) => {
      current.resolve?.(value);
      return { open: false, message: "", value: "" };
    });
  }, []);

  const dialog: ReactNode = (
    <AdminDialog
      onClose={() => finish(null)}
      open={state.open}
      title="输入"
    >
      <p className="admin-dialog__lead">{state.message}</p>
      <label className="admin-field">
        口令
        <input
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            valueRef.current = event.target.value;
            setState((current) => ({ ...current, value: event.target.value }));
          }}
          type="password"
          value={state.value}
        />
      </label>
      <div className="admin-btn-row">
        <button
          className="admin-btn admin-btn--ghost"
          onClick={() => finish(null)}
          type="button"
        >
          取消
        </button>
        <button
          className="admin-btn"
          onClick={() => finish(valueRef.current)}
          type="button"
        >
          确定
        </button>
      </div>
    </AdminDialog>
  );

  return { prompt, dialog };
}
