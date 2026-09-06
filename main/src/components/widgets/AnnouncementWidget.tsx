export function AnnouncementWidget({
  heading = "公告",
  body,
}: {
  heading?: string;
  body: string;
}) {
  if (!body) {
    return null;
  }

  return (
    <section className="widget glass-card">
      <h2 className="widget__title">{heading}</h2>
      <p>{body}</p>
    </section>
  );
}
