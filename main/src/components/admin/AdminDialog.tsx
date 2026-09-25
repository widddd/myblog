"use client";

import { AnimatePresence, m, useDragControls } from "motion/react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

const ease = [0.16, 1, 0.3, 1] as const;
const spring = [0.34, 1.4, 0.64, 1] as const;

function subscribeNoop() {
  return () => {};
}

export function AdminDialog({
  open,
  title,
  wide,
  dismissible = true,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  wide?: boolean;
  dismissible?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dragControls = useDragControls();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [dismissible, open, onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="admin-dialog" role="presentation">
          <m.button
            aria-label="关闭"
            className="admin-dialog__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease }}
            onClick={() => {
              if (dismissible) {
                onClose();
              }
            }}
            type="button"
          />
          <m.div
            aria-labelledby={title ? "admin-dialog-title" : undefined}
            aria-modal="true"
            className={cn("admin-dialog__panel", wide && "is-wide")}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragControls={dragControls}
            dragElastic={{ top: 0, bottom: 0.4 }}
            dragListener={false}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            role="dialog"
            transition={{ duration: 0.22, ease: spring }}
            onDragEnd={(_, info) => {
              if (dismissible && info.offset.y > 96) {
                onClose();
              }
            }}
          >
            <button
              aria-hidden="true"
              className="admin-dialog__grab"
              onPointerDown={(event) => dragControls.start(event)}
              tabIndex={-1}
              type="button"
            />
            {title ? (
              <div className="admin-dialog__head">
                <h3 className="admin-dialog__title" id="admin-dialog-title">
                  {title}
                </h3>
                {dismissible ? (
                  <button
                    aria-label="关闭"
                    className="admin-dialog__close"
                    onClick={onClose}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}
            {children}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
