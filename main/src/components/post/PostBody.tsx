import { Lightbox } from "@/components/common/Lightbox";
import { renderMdx } from "@/lib/markdown/mdx";

type PostBodyProps = {
  excerpt: string | null;
  source: string;
};

export async function PostBody({ excerpt, source }: PostBodyProps) {
  const content = await renderMdx(source);

  return (
    <div id="post-content">
      {excerpt ? <p className="post-excerpt">{excerpt}</p> : null}
      <Lightbox>
        <div className="post-content">{content}</div>
      </Lightbox>
    </div>
  );
}
