# pitfalls.md — 已知陷阱（活文档）

> 发现 AI 重复犯错或首次犯且可能再犯的显著错误 → **立即追加**，P-0XX 递增，不删旧条。
> 格式：❌ 错误 / ✅ 规则 / 📎 案例（可选）

### P-001 重复造轮子 / 平行模块
- ❌ 不查 `docs/ai/module.md` 就新写一个已存在的工具/组件（如再写一个日期格式化）
- ✅ 规则：写代码前必读模块注册表；已存在则复用或扩展

### P-002 运行路径与构建配置漂移
- ❌ dev 下能跑、`pnpm build` 报错（如 client 组件引了服务端模块）
- ✅ 规则：交付前 Windows 上同时过 `pnpm dev` 和（M3 起）`pnpm build`

### P-003 编辑器 SSR 报错
- ❌ 在 Server Component 中直接 import vendor 编辑器 → hydration/SSR 崩溃
- ✅ 规则：编辑器只经 `components/admin/EditorLoader.tsx` 引入（client 组件内 `dynamic(ssr:false)`）

### P-004 配置多源不同步
- ❌ Setting KV 新增字段（如 backupPeriodDays）只改了后台表单，漏了 service 读取和默认值回填
- ✅ 规则：新增配置字段同步三处——schema/默认值定义、后台设置表单、service 读取逻辑

### P-005 vendor 目录漂移
- ❌ 升级 `src/editor/` 内依赖版本，或在 editor 内用 `@/`（非 `@/editor`）引项目代码
- ✅ 规则：vendor 子树冻结；改动须先向用户说明理由获批

### P-006 Windows/Linux 路径混用
- ❌ 路径字符串拼 `\`、`split('\\')`、依赖系统 tar——Windows 开发正常、Linux 部署炸
- ✅ 规则：一律 `node:path`；存储 key posix 风格；打包用 archiver 纯 JS

### P-007 高成本操作未经授权
- ❌ 私自跑生产部署、批量删数据、大文件操作
- ✅ 规则：只给命令由用户执行；smoke test 须标注「smoke test，非正式运行」

### P-008 效果宣称无数据
- ❌ 说「性能提升了」「差不多了」而不给具体数值/验证步骤
- ✅ 规则：结论必须带可复现的验证方式或具体数字

### P-009 证伪路线复活
- ❌ 重新引入已否决方案（Lucia、自写 JWT、Drizzle、public 运行时写、cluster、系统 tar）
- ✅ 规则：见 architecture.md「已证伪路线」，复活须用户明确要求

### P-010 定时任务静默挂掉
- ❌ scheduler 回调抛异常导致 setInterval 停摆，定时发布/备份失效无感知
- ✅ 规则：任务回调 try/catch 全包 + 计日志；register 幂等（globalThis 标记 + NEXT_RUNTIME 守卫）

### P-011 SQLite 并发误用
- ❌ pm2 cluster 多进程写同一 db；备份时直接 cp blog.db（WAL 下不一致）
- ✅ 规则：fork 单实例红线；备份只用 better-sqlite3 `.backup()` API

### P-012 密码文章内容泄露
- ❌ 列表/搜索/RSS/相关推荐的查询投影把密码文 content/excerpt 也查出来了
- ✅ 规则：所有对外查询投影显式排除；搜索只回标题；详情页未解锁前不返回正文

### P-013 模糊措辞
- ❌ 报告/回复用「大概」「应该没问题」「较高的」
- ✅ 规则：给具体数值、文件路径、验证步骤

### P-014 计划外更改不留档
- ❌ 实施中临时改方案（换库、加字段）不落档直接继续
- ✅ 规则：先写入 PLAN.md 变更记录或在回复中说明并获确认，再实施

### P-015 改代码未同步文档
- ❌ 交付前没走 agents-maintenance 触发表，module.md/AGENTS 索引与代码脱节
- ✅ 规则：每次交付前对照触发表逐项更新，回复中列出已同步文档路径

### P-016 Prisma adapter 带入旧版 better-sqlite3
- ❌ 只验证项目直接依赖的 `better-sqlite3@13` 可加载，却漏掉 `@prisma/adapter-better-sqlite3@6.19.3` 自带的 v11；Windows Node 24 构建收集页面时找不到 ABI 137 binding
- ✅ 规则：`main/pnpm-workspace.yaml` 必须保留 adapter 子依赖到 `better-sqlite3@13.0.3` 的 override；安装后用 `pnpm why better-sqlite3` 确认全树只有一个版本，再跑 `pnpm build`
- 📎 案例：M1（2026-08-29），覆盖后 `pnpm why` 仅 v13.0.3，生产构建无 binding 错误

### P-017 Next 16 入口约定与规则文件自动生成
- ❌ 按 Next 15 计划继续创建 `middleware.ts`，或首次 `next dev` 后保留框架自动生成在 `main/` 内的第二套 AGENTS.md/CLAUDE.md
- ✅ 规则：Next 16 统一使用 `src/proxy.ts` 导出 `proxy`；`next.config.ts` 保留 `agentRules:false`，项目规则只认根目录 AGENTS.md/CLAUDE.md
- 📎 案例：M1（2026-08-29）

### P-018 未消毒前渲染 MDX 正文
- ❌ 把数据库里的 MDX/`content` 直接当 HTML 输出，或用 `dangerouslySetInnerHTML` 渲染未过 `lib/markdown/sanitize.ts` 的内容
- ✅ 规则：正文必须走 remark-gfm → rehype-slug → rehype-sanitize → shiki；当前 `PostBody` 只展示 excerpt 占位。密码文任何投影不得带 content/excerpt（P-012）
- 📎 案例：M2 骨架（2026-08-29）有意不渲染正文；探针文 slug=`sanitize-probe`

### P-019 整包拷贝 theme-hao CSS
- ❌ 把 `reference/theme-hao/templates/assets/zhheo/zhheoblog.css`（约 1.8 万行，含 PJAX/弹幕/播放器）拷进 `globals.css`
- ✅ 规则：只抽 `--heo-*` token 与需要的玻璃/卡片/波浪规则，写进 `main/src/app/globals.css`；`reference/` 只读

### P-020 rehype-sanitize 不会自动安全放行 MDX JSX
- ❌ 只在 sanitize schema 写入 `Video`，或把 `<Video {...props}>` 直接映射到 DOM；MDX JSX 节点可能被静默删除，也可能让未审计属性绕过普通 HAST 白名单
- ✅ 规则：`lib/markdown/sanitize.ts` 只把字面量、属性白名单内的 `<Video>` 转成标准 `video` HAST，再过 rehype-sanitize；组件禁止展开未知 props；next-mdx-remote 保持 `blockJS:true`
- 📎 案例：M2（2026-08-29），`sanitize-probe` 同时覆盖 script、onerror、javascript:、Video

### P-021 vendor 源码不要交给应用 tsc 严查
- ❌ 把 mdx-editor vendor 的 `.ts/.tsx` 纳入项目 `tsc --noEmit`，mdast/MDX 类型与上游 Vite 配置不一致会炸出上百条错误；或给每个文件加 `// @ts-nocheck`
- ✅ 规则：`tsconfig.json` `exclude` `src/editor`；应用只从 `@myblog/mdx-editor` 导入，类型在 `src/types/mdx-editor.d.ts`。`next.config.ts` 的 Turbopack `resolveAlias` 必须用**项目相对路径**（Windows 上绝对路径 `D:\...` 会报 `windows imports are not implemented yet`）
- 📎 案例：M3（2026-08-29）

### P-022 Next 不允许从组件树 import 全局 CSS
- ❌ 保留 vendor `index.ts` 里的 `import './styles/globals.css'` → Next build 拒绝非 layout 的 global CSS
- ✅ 规则：删掉 vendor 入口的全局 CSS import，改由 `app/admin/(protected)/layout.tsx` 引入 `@/editor/styles/globals.css`。ui.module.css 的 postcss-mixins 在入库时一次性展开，不要塞进 Tailwind 4 的全局 PostCSS
- 📎 案例：M3（2026-08-29）

### P-023 评论蜜罐与 pending 隔离
- ❌ 蜜罐字段非空时返回 400 暴露字段；或游客评论直接 `approved`；或用 `dangerouslySetInnerHTML` 渲染评论/昵称
- ✅ 规则：蜜罐非空仍 200 且不落库；游客一律 `pending`；管理员回复才直接 `approved`；评论链路只走 React 文本节点（`lib/comments/service.ts` + `components/comment/`）
- 📎 案例：M4（2026-08-29）

### P-024 搜索 LIKE 必须转义通配符
- ❌ 把用户输入直接塞进 `LIKE %q%` 或 Prisma `contains`，`%`/`_`/`\` 会扩大命中面；或把原生 SQL 写在 `lib/search` 以外
- ✅ 规则：只在 `lib/search/service.ts` 用 Prisma.sql；先 `escapeLike()` 再 `LIKE ${pattern} ESCAPE char(92)`；密码文只匹配 `title`，结果不含 content
- 📎 案例：M5（2026-08-29）

### P-025 首页 Banner 滚动不要带动背景图
- ❌ 给 Banner 图 `transform: translateY(-scroll)` 或让它随文档流一起上移；或用不透明 `--heo-background` 盖死底图
- ✅ 规则：底图 `position:fixed`；模糊与幕布只用 `--home-blur` / `--home-veil`（幕布颜色跟主题 `--heo-background`，JS 最大透明度 0.28，CSS mask 让视口上部更透）；欢迎卡单独 `isolation`，Banner 遮罩底部淡出，避免 100vh 接缝穿玻璃卡。滚动模糊加在包装层上，不要写在入场 animation 的 `filter` 上（fill-mode:both 会盖掉 CSS 变量）
- 📎 案例：M5（2026-08-29）；M6 把幕布上限从 0.62 调到 0.28 并修欢迎卡接缝

### P-026 备份只用 .backup() 且文件名白名单
- ❌ 直接 `copyFile(blog.db)` / 打包 WAL；或把用户传入的文件名拼进 `data/backups` 路径；或绕过 StorageDriver 扫 `data/uploads`
- ✅ 规则：快照走 `getSqliteHandle().backup()`；下载/删除文件名必须 `isBackupFileName()`（`^myblog-\d{8}-\d{6}\.tar\.gz$`）且 resolve 后仍在 `data/backups` 内；上传对象只经 `StorageDriver.listKeys` / `openReadStream`；并发用进程内锁，冲突 409
- 📎 案例：M6（2026-08-29）

### P-027 写文章工具栏被当成侧栏
- ❌ 给 `.admin-mdx-editor` 设 `display:flex`（默认 row）再写 `> * { height: 100% }`，工具栏和正文并排，控制栏能占掉右栏约 1/3
- ✅ 规则：编辑器根节点必须 `flex-direction:column`，并加 vendor 的 `mdxeditor-full-height`；工具栏 `flex:0 0 auto`，正文区域 `flex:1; min-height:0; overflow:auto`。不要让工具栏子节点被迫拉满高度
- 📎 案例：M7 打磨（2026-08-29）

### P-028 正文视频必须是可编辑的 Video 节点
- ❌ 用 `insertMarkdown('<Video src=... />')` 插入后只渲染一个不能改的 `<video>`；或把 HTML `<video>` / `![](*.mp4)` 原样存库，jsxPlugin 解析失败后无法更换
- ✅ 规则：插入走 `insertJsx$`；`VideoJsxEditor` 必须提供更换/删除；读写都过 `lib/posts/normalize-content.ts`，把 HTML video 与视频图片语法归一成 `<Video />`。不要改 vendor 去「升级」视频能力
- 📎 案例：M7 打磨（2026-08-29）

### P-029 编辑器深色主题不要改 vendor
- ❌ 深色站点下 mdx-editor 仍用浅色 `--baseBg` / `--baseTextContrast`（近黑字 + 白工具栏）；或去改 `src/editor/styles` 换肤
- ✅ 规则：vendor 冻结。在 `globals.css` 用 `[data-theme="dark"] .admin-mdx-editor`（及 popup/select）覆盖 `--base*` / `--slate-*`，让工具栏与正文跟 Heo 深色 token。不要给 html 乱加 `.dark` 以免波及前台
- 📎 案例：M7 打磨（2026-08-29）

### P-030 不要重写编辑器，先修预览样式
- ❌ 标题看起来一样大就换一套编辑器，或把正文当成 textarea；Tailwind preflight 会把 h1–h6 `font-size:inherit`
- ✅ 规则：继续只用 `EditorLoader`。标题字号写在 `.admin-mdx-prose h1–h6`。成稿预览走 `/api/admin/preview`，HTML 必须先过 `renderMdx`/`sanitize`。图片视频拖动写在应用层 toolbar/VideoJsxEditor，不改 vendor
- 📎 案例：M7 打磨（2026-08-29）

### P-031 目录必须收齐编辑器各级标题
- ❌ TOC 只收集 h2–h4；编辑器工具栏「标题 1」导出为 `#` / `h1`，侧栏就显示「本文没有小节」
- ✅ 规则：`lib/markdown/toc.ts` 收集 h1–h6；`Toc` 按 depth 缩进/字重分层，点击 `scrollIntoView({behavior:'smooth'})`。不要再平行写一套 tocbot
- 📎 案例：M7 打磨（2026-08-29）

### P-032 媒体插入不要做工具栏内下拉
- ❌ 图片/视频「上传或外链」用 `position:absolute` 挂在工具栏里；`.admin-mdx-editor` 的 `overflow:hidden` 和正文会把菜单挡住
- ✅ 规则：对齐 WordPress/Halo 的插入框——`MediaInsertMenu` 用 `createPortal` 挂到 `document.body`，`z-index:220`。不要平行重写编辑器（P-030）
- 📎 案例：M7 打磨（2026-08-29）

---

## 追加模板

```markdown
### P-0XX 标题
- ❌ 错误：（实际做了什么）
- ✅ 规则：（正确做法，含文件路径）
- 📎 案例：（关联里程碑/日期）
```
