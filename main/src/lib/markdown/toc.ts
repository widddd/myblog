import { IMAGE_GROUP_CLASS } from "./image-group";

export type TocDepth = 1 | 2 | 3 | 4 | 5 | 6;

export type TocItem = {
  id: string;
  text: string;
  depth: TocDepth;
};

export type TocTreeNode = {
  type: string;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: TocTreeNode[];
};

const HEADING_DEPTH: Record<string, TocDepth> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

export function headingDepth(tagName: string | undefined): TocDepth | null {
  if (!tagName) {
    return null;
  }
  return HEADING_DEPTH[tagName] ?? null;
}

/**
 * 折叠组（`<details class="post-image-group">`）：默认是**收起**的。
 * 组内标题如果进了目录，读者点一下会滚到一块看不见的地方——所以整棵子树都不收。
 */
function isFoldedGroup(node: TocTreeNode): boolean {
  if (node.type !== "element" || node.tagName !== "details") {
    return false;
  }
  const className = node.properties?.className;
  if (Array.isArray(className)) {
    return className.includes(IMAGE_GROUP_CLASS);
  }
  return className === IMAGE_GROUP_CLASS;
}

export function textOf(node: TocTreeNode): string {
  if (node.type === "text" && typeof node.value === "string") {
    return node.value;
  }
  return (node.children ?? []).map(textOf).join("");
}

function ensureHeadingId(node: TocTreeNode, fallbackIndex: number) {
  const existing = node.properties?.id;
  if (typeof existing === "string" && existing.trim()) {
    return existing;
  }
  const id = `heading-${fallbackIndex}`;
  node.properties = { ...node.properties, id };
  return id;
}

/** Walk a HAST tree and collect h1–h6. Mutates nodes that lack an id. */
export function collectTocItems(tree: TocTreeNode): TocItem[] {
  const items: TocItem[] = [];
  let fallback = 0;

  const visit = (node: TocTreeNode) => {
    if (isFoldedGroup(node)) {
      return;
    }
    const depth = headingDepth(node.tagName);
    if (node.type === "element" && depth) {
      const text = textOf(node).trim();
      if (text) {
        fallback += 1;
        items.push({
          id: ensureHeadingId(node, fallback),
          text,
          depth,
        });
      }
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  visit(tree);
  return items;
}

export function createTocCollector(items: TocItem[]) {
  return function rehypeCollectToc() {
    return (tree: TocTreeNode) => {
      items.push(...collectTocItems(tree));
    };
  };
}
