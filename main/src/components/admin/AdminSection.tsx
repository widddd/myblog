"use client";

import { useState, type ReactNode } from "react";

export function AdminSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <details
      className="admin-section"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="admin-section__title">{title}</summary>
      {children}
    </details>
  );
}
