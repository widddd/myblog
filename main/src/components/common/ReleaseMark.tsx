import { APP_RELEASE_LABEL } from "@/lib/release";
import { cn } from "@/lib/utils/cn";

export function ReleaseMark({ className }: { className?: string }) {
  return (
    <span className={cn("release-mark", className)} title={APP_RELEASE_LABEL}>
      {APP_RELEASE_LABEL}
    </span>
  );
}
