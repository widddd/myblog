"use client";

import { useEffect, useState } from "react";

import { formatUptime, parseSiteStartedAt } from "@/lib/home/uptime";

type UptimeModuleProps = {
  heading?: string;
  startedAt: string;
};

export function UptimeModule({ heading, startedAt }: UptimeModuleProps) {
  const startMs = parseSiteStartedAt(startedAt)?.getTime() ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startMs == null) {
      return;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startMs]);

  if (startMs == null) {
    return null;
  }

  return (
    <section className="home-uptime glass-card">
      {heading ? <h2 className="widget__title">{heading}</h2> : null}
      <p className="home-uptime__value">{formatUptime(now - startMs)}</p>
    </section>
  );
}
