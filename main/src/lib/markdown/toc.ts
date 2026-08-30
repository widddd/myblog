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
