import { createHmac } from "node:crypto";

const UNKNOWN_IP = "unknown";

function firstValidIp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 45) {
    return null;
  }
  if (isIpv4(trimmed) || isIpv6(trimmed)) {
    return trimmed;
  }
  return null;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function isIpv6(value: string): boolean {
  if (!value.includes(":")) {
    return false;
  }
  return /^[0-9a-fA-F:]+$/.test(value) && value.split(":").length >= 3;
}

/**
 * Prefer the address written by the reverse proxy.
 * Do not use the first X-Forwarded-For hop — clients can spoof it.
 */
export function getClientIp(headers: Headers): string {
  const realIp = firstValidIp(headers.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const cloudflareIp = firstValidIp(headers.get("cf-connecting-ip"));
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((part) => part.trim());
    for (let index = hops.length - 1; index >= 0; index -= 1) {
      const ip = firstValidIp(hops[index]);
      if (ip) {
        return ip;
      }
    }
  }

  return UNKNOWN_IP;
}

export function fingerprint(ip: string, userAgent: string): string {
  const secret =
    process.env.FINGERPRINT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("缺少 FINGERPRINT_SECRET 或 SESSION_SECRET");
  }

  return createHmac("sha256", secret)
    .update(`${ip.trim() || UNKNOWN_IP}\n${userAgent.trim()}`)
    .digest("hex");
}
