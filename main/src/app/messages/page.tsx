import type { Metadata } from "next";

import { CommentSection } from "@/components/comment/CommentSection";
import { SiteShell } from "@/components/layout/SiteShell";
import { listApprovedComments } from "@/lib/comments/service";
import { publicMetadata } from "@/lib/seo/site";

export function generateMetadata(): Promise<Metadata> {
  return publicMetadata({
    title: "留言板",
    description: "给站长留言。",
    path: "/messages",
  });
}

export default async function MessagesPage() {
  const comments = await listApprovedComments({
    targetType: "board",
    targetId: 0,
  });

  return (
    <SiteShell title="留言板">
      <CommentSection
        initialComments={comments.data}
        targetId={0}
        targetType="board"
        total={comments.total}
      />
    </SiteShell>
  );
}
