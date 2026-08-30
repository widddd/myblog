import { defaultSchema, type Options } from "rehype-sanitize";

import { mediaSourceHost } from "@/lib/media/url";

type TreeNode = {
  type: string;
  name?: string | null;
  tagName?: string;
  value?: unknown;
  attributes?: MdxAttribute[];
  properties?: Record<string, unknown>;
  children?: TreeNode[];
};

type MdxAttribute = {
  type: string;
  name?: string;
  value?: unknown;
};

const VIDEO_BOOLEAN_ATTRIBUTES = new Map([
  ["controls", "controls"],
  ["loop", "loop"],
  ["muted", "muted"],
  ["playsInline", "playsInline"],
]);

const VIDEO_STRING_ATTRIBUTES = new Map([
  ["poster", "poster"],
  ["preload", "preload"],
  ["src", "src"],
  ["title", "title"],
]);

const VIDEO_NUMBER_ATTRIBUTES = new Map([
  ["height", "height"],
  ["width", "width"],
]);

function safeMediaUrl(value: string): string | null {
  if (value.startsWith("/api/uploads/")) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function videoProperties(attributes: MdxAttribute[] | undefined) {
  const properties: Record<string, unknown> = {
    controls: true,
    playsInline: true,
    preload: "metadata",
  };

  for (const attribute of attributes ?? []) {
    if (
      attribute.type !== "mdxJsxAttribute" ||
      typeof attribute.name !== "string"
    ) {
      continue;
    }

    const booleanName = VIDEO_BOOLEAN_ATTRIBUTES.get(attribute.name);
    if (booleanName && (attribute.value === null || typeof attribute.value === "boolean")) {
      properties[booleanName] = attribute.value ?? true;
      continue;
    }

    const stringName = VIDEO_STRING_ATTRIBUTES.get(attribute.name);
    if (stringName && typeof attribute.value === "string") {
      if (stringName === "src" || stringName === "poster") {
        const safeValue = safeMediaUrl(attribute.value);
        if (safeValue) {
          properties[stringName] = safeValue;
        }
      } else if (
        stringName === "preload" &&
        ["none", "metadata", "auto"].includes(attribute.value)
      ) {
        properties[stringName] = attribute.value;
      } else if (stringName === "title") {
        properties[stringName] = attribute.value.slice(0, 200);
      }
      continue;
    }

    const numberName = VIDEO_NUMBER_ATTRIBUTES.get(attribute.name);
    if (numberName && typeof attribute.value === "string") {
      const number = Number(attribute.value);
      if (Number.isInteger(number) && number > 0 && number <= 4096) {
        properties[numberName] = number;
      }
    }
  }

  return typeof properties.src === "string" ? properties : null;
}

function asVideoElement(node: TreeNode, properties: Record<string, unknown>) {
  const src = properties.src;
  const host = typeof src === "string" ? mediaSourceHost(src) : null;
  properties.className = ["post-video"];
  delete node.name;
  delete node.attributes;

  if (!host) {
    node.type = "element";
    node.tagName = "video";
    node.properties = properties;
    node.children = [];
    return;
  }

  node.type = "element";
  node.tagName = "figure";
  node.properties = { className: ["post-video-wrap"] };
  node.children = [
    {
      type: "element",
      tagName: "video",
      properties,
      children: [],
    },
    {
      type: "element",
      tagName: "figcaption",
      properties: { className: ["post-video-mark"] },
      children: [{ type: "text", value: `外链 · ${host}` }],
    },
  ];
}

function transformVideoNodes(node: TreeNode): void {
  if (
    (node.type === "mdxJsxFlowElement" ||
      node.type === "mdxJsxTextElement") &&
    node.name === "Video"
  ) {
    const properties = videoProperties(node.attributes);
    if (properties) {
      asVideoElement(node, properties);
    } else {
      node.type = "text";
      node.value = "";
      node.children = [];
      delete node.name;
      delete node.attributes;
    }
    return;
  }

  if (node.type === "element" && node.tagName === "video") {
    const src = node.properties?.src;
    if (typeof src === "string") {
      const safe = safeMediaUrl(src);
      if (safe) {
        asVideoElement(node, {
          ...node.properties,
          src: safe,
          controls: true,
          playsInline: true,
          preload: "metadata",
        });
      }
    }
    return;
  }

  for (const child of node.children ?? []) {
    transformVideoNodes(child);
  }
}

export function rehypeAllowVideo() {
  return (tree: TreeNode) => {
    transformVideoNodes(tree);
  };
}

export const sanitizeSchema: Options = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    figure: ["className"],
    figcaption: ["className"],
    video: [
      "controls",
      "height",
      "loop",
      "muted",
      "playsInline",
      "poster",
      "preload",
      "src",
      "title",
      "width",
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    poster: ["https"],
    src: ["http", "https"],
  },
};
