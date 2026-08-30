import { createHmac } from "node:crypto";

const UNKNOWN_IP = "unknown";

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",", 1)[0]?.trim();

  return (
    firstForwarded ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    UNKNOWN_IP
  );
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
