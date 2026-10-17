import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * 折叠组的「内容拆分」（纯函数，配 image-group-split.test.tsx）。
 *
 * 渲染树长这样（`lib/markdown/image-group.ts` 转出来的）：
 *   <details class="post-image-group">
 *     <summary>花期 · 2 张</summary>
 *     <p><img …/></p>
 *     <p><img …/></p>
 *   </details>
 * 堆叠卡要按「一张图一张卡」来排，所以这里把图片从段落里抽出来，规则是：
 * - 图片不论被包在几层段落里都抽出来当卡片；
 * - 只装图片的包裹层整层丢掉（不丢就会渲染两遍）；
 * - 还装着别的（文字、视频…）的包裹层保留下来，只是把图片摘掉；
 * - `summary` 只取文字当无障碍标签，本身不渲染。
 *
 * 图片元素**原样保留**：它带着 `data-lightbox-src`（原图）与 `data-lightbox-thumb`（一级缩略图），
 * 灯箱靠事件委托点得到，这里一个属性都不用重造。
 */

export type ImgElement = ReactElement<
  { src?: string; className?: string } & Record<string, unknown>
>;

export type SplitGroup = {
  images: ImgElement[];
  others: ReactNode[];
  label: string;
};

export function isImg(node: ReactNode): node is ImgElement {
  return isValidElement(node) && node.type === "img";
}

export function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

export function splitGroup(children: ReactNode): SplitGroup {
  const images: ImgElement[] = [];
  const others: ReactNode[] = [];
  let label = "";

  const walk = (node: ReactNode): ReactNode[] => {
    if (node === null || node === undefined || node === false) {
      return [];
    }
    if (isImg(node)) {
      images.push(node);
      return [];
    }
    if (!isValidElement(node)) {
      return [node];
    }
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (element.type === "summary") {
      label = textOf(element.props.children);
      return [];
    }
    if (typeof element.type !== "string") {
      return [node];
    }
    const childNodes = Children.toArray(element.props.children);
    if (childNodes.length === 0) {
      // 叶子元素（`<video>` / `<audio>` / `<br>` …）：原样留下。
      // 少了这一条它们会被当成"空包裹层"丢掉——组件里放个视频就凭空消失。
      return [node];
    }
    const inner = childNodes.flatMap(walk);
    if (inner.length === 0) {
      return [];
    }
    return [cloneElement(element, undefined, ...inner)];
  };

  for (const child of Children.toArray(children)) {
    others.push(...walk(child));
  }

  return { images, others, label };
}
