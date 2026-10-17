/**
 * 「导入文件」→ 模块三栏代码的纯转换层。
 *
 * 管理员经常是拿现成的一段 HTML 开始改：这里把整份 HTML 拆成
 * HTML / CSS / JS 三栏（内联的 `<style>` / `<script>` 归位），
 * 其余格式按扩展名直接填进对应栏。
 *
 * 只做文本搬运，不执行、不解析 DOM —— 无 node / DOM 依赖，可单测。
 */

export const MODULE_CODE_MAX = 32_768;

export type CodeField = "html" | "css" | "js";

export type ImportedCode = {
  /** 内容从哪个扩展名认出来的（调用方据此决定填哪栏）*/
  field: CodeField;
  /** 原始文件名，仅用于回显 */
  fileName: string;
  html: string;
  css: string;
  js: string;
  /** 给用户看的说明（拆了几块、截断与否…）*/
  notes: string[];
};

const FIELD_BY_EXTENSION: Record<string, CodeField> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "js",
  mjs: "js",
  cjs: "js",
  txt: "html",
};

export function codeFieldForFileName(fileName: string): CodeField | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return null;
  }
  const ext = fileName.slice(dot + 1).toLowerCase();
  return FIELD_BY_EXTENSION[ext] ?? null;
}

/** 大小写不敏感，但只认完整的 `<style>` / `<script>` 元素（带属性的也认）。 */
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

function hasSrcAttribute(attributes: string): boolean {
  return /\bsrc\s*=/i.test(attributes);
}

function clampCode(label: string, value: string, max: number, notes: string[]): string {
  if (value.length <= max) {
    return value;
  }
  notes.push(`${label}超过 ${Math.round(max / 1024)}KB，已截断`);
  return value.slice(0, max);
}

/**
 * 拆一份 HTML。
 *
 * - `<style>…</style>` → CSS 栏
 * - `<script>…</script>`（**没有 `src` 的**）→ JS 栏；带 `src` 的外链脚本原样留在 HTML 里
 * - 剩下的 HTML 去头尾空白后放进 HTML 栏
 *
 * 超出上限只截断并给出提示，不抛错 —— 导入是最后一步，宁可少一段也不能整份丢掉。
 */
export function splitHtmlDocument(source: string, max = MODULE_CODE_MAX): ImportedCode {
  const notes: string[] = [];
  const cssParts: string[] = [];
  const jsParts: string[] = [];

  let html = source.replace(STYLE_BLOCK, (_match, body: string) => {
    if (body.trim()) {
      cssParts.push(body.trim());
    }
    return "";
  });

  html = html.replace(SCRIPT_BLOCK, (match, attributes: string, body: string) => {
    if (hasSrcAttribute(attributes)) {
      return match;
    }
    if (body.trim()) {
      jsParts.push(body.trim());
    }
    return "";
  });

  html = html.replace(/\n{3,}/g, "\n\n").trim();

  if (cssParts.length) {
    notes.push(`把 ${cssParts.length} 段 <style> 移到了 CSS 栏`);
  }
  if (jsParts.length) {
    notes.push(`把 ${jsParts.length} 段 <script> 移到了 JS 栏`);
  }

  return {
    field: "html",
    fileName: "",
    html: clampCode("HTML", html, max, notes),
    css: clampCode("CSS", cssParts.join("\n\n"), max, notes),
    js: clampCode("JS", jsParts.join("\n\n"), max, notes),
    notes,
  };
}

/** 入口：按文件名判断内容属于哪一栏。不认识的扩展名返回 null（调用方报错）。 */
export function parseModuleImport(
  fileName: string,
  source: string,
  max = MODULE_CODE_MAX,
): ImportedCode | null {
  const field = codeFieldForFileName(fileName);
  if (!field) {
    return null;
  }

  if (field === "html") {
    return { ...splitHtmlDocument(source, max), fileName };
  }

  const notes: string[] = [];
  const content = clampCode(field === "css" ? "CSS" : "JS", source, max, notes);

  return {
    field,
    fileName,
    html: "",
    css: field === "css" ? content : "",
    js: field === "js" ? content : "",
    notes,
  };
}
