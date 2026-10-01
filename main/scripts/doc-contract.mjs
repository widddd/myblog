#!/usr/bin/env node
/**
 * doc-contract.mjs — 文档契约检查器（机制的执行器）
 *
 * 作用：把 AGENTS.md / docs/ 里那些"靠自觉"的约定，变成一条能立刻跑出红绿的检查。
 * 运行：在 main/ 下执行 `pnpm doc:check`（等价 `node scripts/doc-contract.mjs`）
 * 参数：
 *   --json        只输出机器可读 JSON
 *   --warn-only   警告不改变退出码（默认：Error 级问题退出码 1）
 *   --quiet       只输出失败项
 *
 * 它检查什么（对应 docs/AUDIT-AGENTS-MECHANISM.md 的 P0-1）：
 *   1. 目录索引完整性   AGENTS §3 链接的每个文档是否存在；docs/ 每个文件是否被任何根文档登记
 *   2. 命令注册表完整性 package.json 的脚本是否在 AGENTS 命令清单里；清单里的命令是否真实存在
 *   3. 状态源表述一致性 草稿/已发行/当前阶段/发行号在各文件间是否互斥
 *   4. 篇章约束         AGENTS.md 行数上限（按它自己声明的 N 行）
 *   5. pitfalls 结构    编号单调、条目格式是否退化
 *
 * 设计约束：只读（不写任何文件）、~1s 返回、无第三方依赖（Node ≥18 内置能力）、Windows/Linux 同路径。
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", ".."); // main/scripts -> repo root

const argv = new Set(process.argv.slice(2));
const AS_JSON = argv.has("--json");
const WARN_ONLY = argv.has("--warn-only");
const QUIET = argv.has("--quiet");

/** @type {{group:string,level:'error'|'warn',msg:string,detail?:string}[]} */
const findings = [];
const add = (group, level, msg, detail) => findings.push({ group, level, msg, detail: detail || "" });

const rd = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "");
const exists = (p) => existsSync(p);
const lineCount = (p) => rd(p).split(/\r?\n/).length;

const AGENTS = join(ROOT, "AGENTS.md");
const DOCS = join(ROOT, "docs");
const PKG = join(ROOT, "main", "package.json");

if (!exists(AGENTS) || !exists(PKG)) {
  console.error("[doc-contract] 找不到 AGENTS.md 或 main/package.json，请在仓库内运行");
  process.exit(2);
}

const agentsText = rd(AGENTS);
const pkg = JSON.parse(rd(PKG));

/** 收集 docs/ 下全部 .md（相对仓库根，POSIX 风格） */
function walkMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full));
    else if (name.endsWith(".md")) out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}
const docFiles = walkMarkdown(DOCS);

/* ── 1. 目录索引完整性 ───────────────────────────────────────────── */
// AGENTS 正文里出现的所有 .md 链接目标（去掉锚点），逐个验证存在
const agentsLinks = [...agentsText.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)].map((m) => m[1]);
for (const link of new Set(agentsLinks)) {
  if (/^https?:/i.test(link)) continue;
  const target = resolve(ROOT, link);
  if (!exists(target)) add("目录索引", "error", `AGENTS.md 链接的文档不存在：${link}`);
}

// 反向：docs/ 每个文件必须被**仓库根的某份 .md** 提及（AGENTS / README / PLAN …）。
// 注意：这里**不读 `docs/README.md`** —— 所以只在 docs/README.md 登记、根文档没提的
// 里程碑 Spec（m2/m4/m5/m6-spec 等）会稳定报 error。这是口径，不是文档缺失。
const rootDocs = readdirSync(ROOT).filter((f) => f.endsWith(".md"));
const inbound = new Map();
for (const f of rootDocs) {
  const abs = join(ROOT, f);
  if (!statSync(abs).isFile()) continue;
  if (f === "HANDOFF.md") continue; // 冻结的历史快照不承担索引职责
  const text = rd(abs);
  for (const d of docFiles) {
    const base = d.split("/").pop();
    if (text.includes(d) || text.includes(base)) {
      if (!inbound.has(d)) inbound.set(d, []);
      inbound.get(d).push(f);
    }
  }
}
for (const d of docFiles) {
  const who = inbound.get(d) || [];
  if (who.length === 0) add("目录索引", "error", `docs/ 孤儿文件（仓库根文档均未提及）：${d}`);
  else if (!who.includes("AGENTS.md") && !who.includes("README.md")) {
    add("目录索引", "warn", `仅被 docs 内部交叉引用，未进任何索引表：${d}`, who.join(", "));
  }
}

/* ── 2. 命令注册表完整性 ─────────────────────────────────────────── */
const scripts = Object.keys(pkg.scripts || {});
// 「核心命令」段落：AGENTS 里那一行（它自己就是一行清单）
const cmdSection = (agentsText.match(/核心命令[^\n]*/) || [""])[0];
// 其它文档里是否明确写过这条命令（写过 = 新会话至少有机会知道）
const docMentions = (name) =>
  rootDocs.some((f) => f !== "HANDOFF.md" && rd(join(ROOT, f)).includes(`pnpm ${name}`));
for (const s of scripts) {
  const inSection = cmdSection.includes(s);
  const inWhole = agentsText.includes(s);
  const inDocs = docMentions(s);
  if (inSection) continue; // 已登记在核心命令清单
  if (!inWhole && !inDocs) {
    add("命令注册", "error", `package.json 脚本在所有必读文档里都查不到：pnpm ${s}`);
  } else {
    // 能跑到，但不在"新会话第一份必读"的命令清单里 → 新会话不知道它存在
    const where = inWhole ? "AGENTS.md 只在非清单位置附带提及" : "只在 docs/ 里提到";
    add("命令注册", "warn", `未进 AGENTS §1 核心命令清单：pnpm ${s}（${where}）`);
  }
}
// 反向：AGENTS 清单里提到但 package.json 不存在的命令（防"幽灵命令"）
const mentioned = [...agentsText.matchAll(/`pnpm ([a-z:][\w:-]*)/g)].map((m) => m[1]);
for (const m of new Set(mentioned)) {
  if (!scripts.includes(m) && !["prisma", "exec", "dlx"].includes(m)) {
    add("命令注册", "warn", `AGENTS.md 提到但 package.json 没有该脚本：pnpm ${m}`);
  }
}

/* ── 3. 状态源表述一致性 ─────────────────────────────────────────── */
const stageSources = [
  { file: "AGENTS.md", text: agentsText },
  { file: "docs/ai/module.md", text: exists(join(DOCS, "ai", "module.md")) ? rd(join(DOCS, "ai", "module.md")) : "" },
];
const RELEASED = /已提交为发行|已发行|已发布|本地发行/;
const ONGOING = /进行中|暂缓|待办|未完成/;
for (const src of stageSources) {
  if (!src.text) continue;
  const lines = src.text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/当前阶段|当前进展|已提交为发行/.test(line)) return;
    if (RELEASED.test(line) && ONGOING.test(line)) {
      add("状态一致性", "error", `${src.file}:${i + 1} 同一处同时表述"进行中"与"已发行"`, line.slice(0, 60) + "…");
    }
  });
}
// 发行号一致：package.json version 必须能在 AGENTS 里找到
const version = pkg.version;
if (version && !agentsText.includes(version)) {
  add("状态一致性", "warn", `package.json version=${version} 未出现在 AGENTS.md（发行号无单源）`);
}
// "当前阶段"句多处并存 → 至少报告它们各自说的是什么
const stageLines = [];
for (const src of stageSources) {
  if (!src.text) continue;
  src.text.split(/\r?\n/).forEach((line, i) => {
    if (/当前阶段/.test(line)) stageLines.push(`${src.file}:${i + 1} → ${line.replace(/^[-\s]*/, "").slice(0, 70)}…`);
  });
}
if (stageLines.length > 1) {
  add("状态一致性", "warn", `"当前阶段"在 ${stageLines.length} 处各自表述（建议收敛到单源）`, stageLines.join(" | "));
}

/* ── 4. AGENTS.md 行数上限 ──────────────────────────────────────── */
const declared = agentsText.match(/≤\s*(\d{2,4})\s*行/);
const limit = declared ? Number(declared[1]) : 400;
const agentsLines = lineCount(AGENTS);
if (agentsLines > limit) {
  add("篇章约束", "error", `AGENTS.md 超出自定上限：${agentsLines} > ${limit} 行`);
} else {
  add("篇章约束", "warn", `AGENTS.md ${agentsLines}/${limit} 行（余量 ${limit - agentsLines}）`);
}

/* ── 5. pitfalls 结构 ────────────────────────────────────────────── */
const PIT = join(DOCS, "pitfalls.md");
if (exists(PIT)) {
  const pitLines = rd(PIT).split(/\r?\n/);
  const heads = [];
  pitLines.forEach((line, i) => {
    const m = line.match(/^###\s*(P-0(\d{2,3}))\s/);
    if (m) heads.push({ id: m[1], num: Number(m[2]), line: i + 1, rest: line });
  });
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].num < heads[i - 1].num) {
      add("pitfalls", "warn", `编号倒序：${heads[i].id}（行 ${heads[i].line}）出现在 ${heads[i - 1].id} 之后`);
    }
  }
  // 格式退化：旧式条目为 4–5 行短句，新式带命令/实测/案例；统计"无证据行"的条目
  const longDocs = [];
  let short = 0;
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].line - 1 : pitLines.length;
    const body = pitLines.slice(h.line, end).join("\n");
    if (/```|`\w|实测|案例|📎|P-0\d\d 同类|行 \d+/.test(body)) longDocs.push(h.id);
    else short++;
  });
  add("pitfalls", "warn", `共 ${heads.length} 条；带命令/实测/案例 ${longDocs.length} 条，短句式 ${short} 条（格式不统一）`);
}

/* ── 输出 ───────────────────────────────────────────────────────── */
const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");

if (AS_JSON) {
  console.log(JSON.stringify({ root: ROOT, agentsLines, limit, scriptCount: scripts.length, docCount: docFiles.length, findings }, null, 2));
} else {
  const groups = [...new Set(findings.map((f) => f.group))];
  console.log("📐 文档契约检查 · doc-contract");
  console.log(`   仓库 ${ROOT}`);
  console.log(`   AGENTS.md ${agentsLines}/${limit} 行 · docs ${docFiles.length} 个 md · pnpm 脚本 ${scripts.length} 个`);
  for (const g of groups) {
    const rows = findings.filter((f) => f.group === g && (!QUIET || f.level === "error"));
    if (!rows.length) continue;
    console.log(`\n── ${g} ──`);
    for (const r of rows) {
      const mark = r.level === "error" ? "✗" : "⚠";
      console.log(`  ${mark} ${r.msg}`);
      if (r.detail) console.log(`      ${r.detail}`);
    }
  }
  console.log(`\n结果：${errors.length ? "✗" : "✓"} error ${errors.length} / warn ${warns.length}`);
}

process.exitCode = errors.length && !WARN_ONLY ? 1 : 0;
