import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownImport } from "./import-markdown";

test("parseMarkdownImport reads YAML frontmatter and filename fallback", () => {
  const imported = parseMarkdownImport(
    "---\ntitle: Hello\nslug: hello-world\nexcerpt: 'A note'\n---\n\n# Body\n",
  );
  assert.equal(imported.title, "Hello");
  assert.equal(imported.slug, "hello-world");
  assert.equal(imported.excerpt, "A note");
  assert.equal(imported.content, "# Body\n");

  const fromFile = parseMarkdownImport("# only body\n", "my-post.md");
  assert.equal(fromFile.title, "my-post");
  assert.equal(fromFile.content, "# only body\n");
});
