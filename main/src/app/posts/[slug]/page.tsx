import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { PostBody } from "@/components/post/PostBody";
import { PasswordGate } from "@/components/post/PasswordGate";
import { PostHero } from "@/components/post/PostHero";
import { ReadingProgress } from "@/components/post/ReadingProgress";
import { CommentSection } from "@/components/comment/CommentSection";
import { Sidebar } from "@/components/layout/Sidebar";
import { listApprovedComments } from "@/lib/comments/service";
import { extractToc } from "@/lib/markdown/mdx";
import {
  getPublishedPostContent,
  getPublishedPostMeta,
} from "@/lib/posts/query";
import { isPostUnlocked } from "@/lib/posts/unlock";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostMeta(slug);
  if (!post) {
    return { title: "未找到文章" };
  }
  return {
    title: post.title,
    description: post.locked ? "这篇文章已加密" : (post.excerpt ?? undefined),
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPublishedPostMeta(slug);

  if (!post) {
    notFound();
  }

  let unlocked = !post.locked;
  if (post.locked) {
    noStore();
    unlocked = await isPostUnlocked(slug);
  }
  const postContent = unlocked
    ? await getPublishedPostContent(slug, post.locked)
    : null;
  if (unlocked && !postContent) {
    notFound();
  }
  const toc = postContent
    ? await extractToc(postContent.content)
    : undefined;
  const comments = unlocked
    ? await listApprovedComments({
        targetType: "post",
        targetId: post.id,
      })
    : null;

  return (
    <>
      {postContent ? <ReadingProgress /> : null}
      <PostHero post={post} />
      <div className="home-below" style={{ marginTop: 0, paddingTop: 8 }}>
        <div className="layout">
          <div className="layout__main">
            <article className="post-panel glass-card">
              {post.locked ? (
                postContent ? (
                  <PostBody
                    excerpt={postContent.excerpt}
                    source={postContent.content}
                  />
                ) : (
                  <PasswordGate slug={post.slug} title={post.title} />
                )
              ) : (
                <PostBody
                  excerpt={postContent?.excerpt ?? null}
                  source={postContent?.content ?? ""}
                />
              )}
            </article>
            {comments ? (
              <CommentSection
                initialComments={comments.data}
                targetId={post.id}
                targetType="post"
                total={comments.total}
              />
            ) : null}
          </div>
          <aside className="layout__aside">
            <Sidebar toc={toc} />
          </aside>
        </div>
      </div>
    </>
  );
}
