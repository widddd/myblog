"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { adminJson } from "@/lib/client/admin";
import {
  DATA_CLEAR_TARGET_LABELS,
  DATA_CLEAR_TARGETS,
  DATA_CLEAR_WAIT_MS,
  dataClearConfirmation,
  type DataClearTarget,
} from "@/lib/data-clear/contract";

type PendingResponse = {
  data: {
    operationId: string;
    executeAt: string;
    serverNow: string;
    waitMs: number;
    targets: DataClearTarget[];
  };
};

type ExecuteResponse = {
  data: {
    completed: true;
    requiresSetup: boolean;
  };
};

type DialogPhase = "review" | "waiting" | "executing";

function toggleTarget(
  targets: DataClearTarget[],
  target: DataClearTarget,
): DataClearTarget[] {
  return targets.includes(target)
    ? targets.filter((item) => item !== target)
    : [...targets, target];
}

export function DataClearDialog({
  disabled,
  onCompleted,
}: {
  disabled: boolean;
  onCompleted: (requiresSetup: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DialogPhase>("review");
  const [targets, setTargets] = useState<DataClearTarget[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [executeAt, setExecuteAt] = useState<number | null>(null);
  const [waitMs, setWaitMs] = useState(DATA_CLEAR_WAIT_MS);
  const [remainingMs, setRemainingMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const executionStartedRef = useRef(false);
  const cancelStartedRef = useRef(false);
  const clockOffsetMsRef = useRef(0);

  const expectedConfirmation = useMemo(
    () => dataClearConfirmation(targets),
    [targets],
  );
  const progress =
    waitMs > 0 ? Math.max(0, Math.min(1, remainingMs / waitMs)) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  const reset = useCallback(() => {
    setOpen(false);
    setPhase("review");
    setTargets([]);
    setConfirmation("");
    setAcknowledged(false);
    setOperationId(null);
    setExecuteAt(null);
    setWaitMs(DATA_CLEAR_WAIT_MS);
    setRemainingMs(0);
    setBusy(false);
    setError("");
    executionStartedRef.current = false;
    cancelStartedRef.current = false;
    clockOffsetMsRef.current = 0;
  }, []);

  const execute = useCallback(
    async (token: string) => {
      if (executionStartedRef.current || cancelStartedRef.current) {
        return;
      }
      executionStartedRef.current = true;
      setPhase("executing");
      setBusy(true);
      try {
        const payload = await adminJson<ExecuteResponse>(
          "/api/admin/update/clear",
          {
            method: "PUT",
            body: JSON.stringify({ operationId: token }),
          },
        );
        const requiresSetup = payload.data.requiresSetup;
        reset();
        onCompleted(requiresSetup);
      } catch (caught) {
        setBusy(false);
        setPhase("review");
        setOperationId(null);
        setExecuteAt(null);
        setRemainingMs(0);
        executionStartedRef.current = false;
        setError(caught instanceof Error ? caught.message : "执行数据清理失败");
      }
    },
    [onCompleted, reset],
  );

  useEffect(() => {
    if (!open || phase !== "waiting" || !operationId || executeAt === null) {
      return;
    }

    let timer: number | undefined;
    const tick = () => {
      const remaining = Math.max(
        0,
        executeAt - (Date.now() + clockOffsetMsRef.current),
      );
      setRemainingMs(remaining);
      if (remaining <= 0) {
        void execute(operationId);
        return;
      }
      timer = window.setTimeout(tick, 50);
    };

    tick();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [execute, executeAt, open, operationId, phase]);

  const cancel = useCallback(async () => {
    if (busy || executionStartedRef.current) {
      return;
    }
    if (phase === "executing") {
      return;
    }
    if (!operationId || phase !== "waiting") {
      reset();
      return;
    }

    setBusy(true);
    cancelStartedRef.current = true;
    setError("");
    try {
      await adminJson("/api/admin/update/clear", {
        method: "DELETE",
        body: JSON.stringify({ operationId }),
      });
      reset();
    } catch (caught) {
      setBusy(false);
      cancelStartedRef.current = false;
      setError(caught instanceof Error ? caught.message : "取消数据清理失败");
    }
  }, [busy, operationId, phase, reset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "executing") {
        void cancel();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [cancel, open, phase]);

  async function beginWaiting() {
    if (
      targets.length === 0 ||
      confirmation !== expectedConfirmation ||
      !acknowledged ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = await adminJson<PendingResponse>(
        "/api/admin/update/clear",
        {
          method: "POST",
          body: JSON.stringify({
            targets,
            confirmation,
            acknowledged: true,
          }),
        },
      );
      const parsedExecuteAt = Date.parse(payload.data.executeAt);
      if (Number.isNaN(parsedExecuteAt)) {
        throw new Error("服务器返回的清理时间无效");
      }
      const parsedServerNow = Date.parse(payload.data.serverNow);
      if (Number.isNaN(parsedServerNow)) {
        throw new Error("服务器返回的校准时间无效");
      }
      clockOffsetMsRef.current = parsedServerNow - Date.now();
      const serverWaitMs =
        Number.isFinite(payload.data.waitMs) &&
        payload.data.waitMs >= DATA_CLEAR_WAIT_MS
          ? payload.data.waitMs
          : DATA_CLEAR_WAIT_MS;
      setWaitMs(serverWaitMs);
      setOperationId(payload.data.operationId);
      setExecuteAt(parsedExecuteAt);
      setRemainingMs(
        Math.max(
          0,
          parsedExecuteAt - (Date.now() + clockOffsetMsRef.current),
        ),
      );
      setPhase("waiting");
      setBusy(false);
      executionStartedRef.current = false;
      cancelStartedRef.current = false;
    } catch (caught) {
      setBusy(false);
      clockOffsetMsRef.current = 0;
      setError(caught instanceof Error ? caught.message : "无法开始数据清理");
    }
  }

  return (
    <>
      <div className="admin-section admin-clear-section">
        <h3 className="admin-section__title">危险操作</h3>
        <p className="admin-danger">
          清空操作不可恢复。请确认备份不再需要，并确保配置的 COS 桶只供本站使用。
        </p>
        <button
          className="admin-danger-button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setPhase("review");
            setError("");
          }}
          type="button"
        >
          清空数据
        </button>
      </div>

      {open
        ? createPortal(
            <div
              className="admin-clear-backdrop"
              onClick={(event) => {
                if (
                  event.target === event.currentTarget &&
                  phase !== "executing"
                ) {
                  void cancel();
                }
              }}
            >
              <div
                aria-describedby="admin-clear-description"
                aria-labelledby="admin-clear-title"
                aria-modal="true"
                className="admin-clear-dialog"
                role="dialog"
              >
                <div className="admin-clear-dialog__head">
                  <h3 id="admin-clear-title">确认清空数据</h3>
                  <button
                    aria-label="关闭"
                    className="admin-clear-dialog__close"
                    disabled={phase === "executing"}
                    onClick={() => void cancel()}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="admin-clear-dialog__body">
                  <p id="admin-clear-description" className="admin-danger">
                    {phase === "waiting" || phase === "executing"
                      ? "确认后会删除所选范围，期间仍可取消；操作一旦执行无法恢复。"
                      : "这是不可逆的破坏性操作。请只选择确实要删除的范围。"}
                  </p>

                  <div className="admin-clear-options">
                    {DATA_CLEAR_TARGETS.map((target) => (
                      <label className="admin-clear-option" key={target}>
                        <input
                          checked={targets.includes(target)}
                          disabled={phase !== "review" || busy}
                          onChange={() =>
                            setTargets((current) =>
                              toggleTarget(current, target),
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{DATA_CLEAR_TARGET_LABELS[target]}</strong>
                          <small>
                            {target === "data"
                              ? "文章、瞬间、评论、媒体、备份和更新暂存"
                              : "删除全部管理员账号，之后需重新创建"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>

                  {phase === "review" ? (
                    <>
                      <p className="admin-clear-scope">
                        将删除：{expectedConfirmation || "尚未选择范围"}
                      </p>
                      <label className="admin-field">
                        请输入确认短语「
                        {expectedConfirmation || "选择范围后显示"}」
                        <input
                          autoFocus={Boolean(expectedConfirmation)}
                          autoComplete="off"
                          disabled={!expectedConfirmation || busy}
                          onChange={(event) =>
                            setConfirmation(event.target.value)
                          }
                          spellCheck={false}
                          value={confirmation}
                        />
                      </label>
                      <label className="admin-clear-ack">
                        <input
                          checked={acknowledged}
                          disabled={busy}
                          onChange={(event) =>
                            setAcknowledged(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>我已了解：删除后不能从本页面撤回或恢复。</span>
                      </label>
                      {error ? <p className="admin-error">{error}</p> : null}
                      <div className="admin-form-actions">
                        <button
                          className="admin-btn admin-btn--link"
                          disabled={busy}
                          onClick={() => void cancel()}
                          type="button"
                        >
                          取消
                        </button>
                        <button
                          className="admin-danger-button"
                          disabled={
                            busy ||
                            targets.length === 0 ||
                            confirmation !== expectedConfirmation ||
                            !acknowledged
                          }
                          onClick={() => void beginWaiting()}
                          type="button"
                        >
                          确认并开始 15 秒倒计时
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p aria-live="polite" className="admin-clear-scope">
                        {phase === "executing"
                          ? "正在执行清理，请不要关闭本页。"
                          : `服务器已登记确认，剩余 ${Math.max(0, remainingSeconds)} 秒；现在仍可取消。`}
                      </p>
                      {error ? <p className="admin-error">{error}</p> : null}
                      {phase === "waiting" ? (
                        <button
                          className="admin-btn admin-btn--link"
                          disabled={busy}
                          onClick={() => void cancel()}
                          type="button"
                        >
                          取消清理
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
                {phase === "waiting" ? (
                  <div
                    aria-label={`清理倒计时，剩余 ${Math.max(0, remainingSeconds)} 秒`}
                    aria-valuemax={waitMs / 1000}
                    aria-valuemin={0}
                    aria-valuenow={Math.max(0, remainingMs / 1000)}
                    className="admin-clear-progress"
                    role="progressbar"
                  >
                    <span style={{ width: `${progress * 100}%` }} />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
