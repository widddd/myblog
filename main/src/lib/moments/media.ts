import { getDriver } from "@/lib/storage";

export function resolvePublicImageUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
    return value;
  }
  try {
    return getDriver().getUrl(value);
  } catch {
    return null;
  }
}
