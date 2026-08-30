import Link from "next/link";

import { cn } from "@/lib/utils/cn";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
};

export function Pagination({ page, pageSize, total, basePath }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return null;
  }

  const href = (target: number) => {
    const separator = basePath.includes("?") ? "&" : "?";
    return target === 1 ? basePath : `${basePath}${separator}page=${target}`;
  };

  return (
    <nav className="pagination" aria-label="分页">
      {Array.from({ length: pages }, (_, index) => {
        const target = index + 1;
        if (target === page) {
          return (
            <span className="is-current" key={target}>
              {target}
            </span>
          );
        }
        return (
          <Link className={cn(target === page && "is-current")} href={href(target)} key={target}>
            {target}
          </Link>
        );
      })}
    </nav>
  );
}
