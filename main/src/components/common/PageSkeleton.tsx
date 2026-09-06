export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="skeleton-stack">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-card glass-card" key={index} />
      ))}
    </div>
  );
}
