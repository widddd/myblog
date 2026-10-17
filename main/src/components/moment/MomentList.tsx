import { CommentSection } from "@/components/comment/CommentSection";
import { LikeButton } from "@/components/moment/LikeButton";
import { MomentGrid } from "@/components/moment/MomentGrid";
import type { PublicComment } from "@/lib/comments/types";
import type { PublicMoment } from "@/lib/moments/types";
import { formatPostDate } from "@/lib/utils/date";

type MomentCardProps = {
  moment: PublicMoment;
  comments: PublicComment[];
  commentTotal: number;
};

export function MomentCard({ moment, comments, commentTotal }: MomentCardProps) {
  return (
    <article className="moment-card glass-card" id={`moment-${moment.id}`}>
      <time>{formatPostDate(moment.createdAt)}</time>
      {/* 瞬间可以不发文字（只发图片 / 视频）：空文案不渲染空段落，免得白占一行 */}
      {moment.content.trim() ? <p>{moment.content}</p> : null}
      <MomentGrid alt="瞬间媒体" images={moment.images} />
      <div className="moment-card__bar">
        <LikeButton
          likeCount={moment.likeCount}
          liked={moment.liked}
          momentId={moment.id}
        />
      </div>
      <CommentSection
        collapsible
        initialComments={comments}
        targetId={moment.id}
        targetType="moment"
        total={commentTotal}
      />
    </article>
  );
}

type MomentListProps = {
  moments: Array<{
    moment: PublicMoment;
    comments: PublicComment[];
    commentTotal: number;
  }>;
};

export function MomentList({ moments }: MomentListProps) {
  return (
    <div className="moment-masonry">
      {moments.map((item) => (
        <MomentCard
          commentTotal={item.commentTotal}
          comments={item.comments}
          key={item.moment.id}
          moment={item.moment}
        />
      ))}
    </div>
  );
}
