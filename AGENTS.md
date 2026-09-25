# AGENTS.md — MyBlog AI 协作总纲

## 0. 地位说明

| 维度 | 说明 |
|---|---|
| **是什么** | 项目根目录的 AI 协作总纲：角色定位、架构红线、目录索引、工作流摘要；每个新会话第一份必读 |
| **不是什么** | 不是百科全书、不是 API 手册、不是运行报告合集 |
| **与 docs/ 的关系** | 本文件 = 规章封面 + 必须遵守的底线；docs/ = 按任务按需翻阅的详细手册 |
| **与 README 的关系** | README 面向人类（安装用法）；本文件面向 AI（协作约束）；互补不替代 |
| **与 reference/rules.md 的关系** | rules.md 是只读施工图纸（本项目规则体系由它搭建），日常协作不读它；与用户口头要求冲突时，**以用户要求为准** |
| **单一事实源** | 全局硬性规则以本文件为准；与 docs/ 冲突时以红线为准并修正 docs/ |
| **篇幅与增量** | ≤400 行；新增前自问「缺了会不会导致 AI 立刻违反底线？」——否则只写 docs/ 并加链接 |

## 1. 项目概览

- **任务**：个人博客系统（前台：主页/瞬间/文章/搜索/留言板；后台：文章管理、发布编辑器、评论、备份、程序更新）
- **技术栈**：Next.js 16 App Router + React 19 + TypeScript + Tailwind 4；Prisma 6 + SQLite（better-sqlite3 adapter）；next-mdx-remote v6 + Shiki；mdx-editor v4.2.3 源码 vendor；iron-session；sharp；motion（仅后台）；Node.js ≥22
- **核心命令**（在 `main/` 下执行）：`pnpm setup`（投产初始化）；`pnpm dev` / `pnpm build` / `pnpm start`（启动走 `scripts/boot.cjs`）；`pnpm pack:update` / `pnpm apply-update --pending`；`pnpm prisma migrate dev`；`pnpm prisma studio`
- **语言约定**：与用户沟通用中文；代码注释与 commit message 用英文或中文均可，日志输出中文
- **角色定位**：你是**资深经验的全栈工程师**。AGENTS.md 与 docs/ 是项目规章与手册，凭专业判断做事，但**未经确认不得擅自改架构、引依赖、动已验证的决策**

### 硬性资源约束（用户钦定）

1. **开发调试在 Windows 上进行**（Win11）。一切脚本、路径处理、原生依赖（sharp/better-sqlite3）必须先保证 Windows 可用，再考虑 Linux 部署兼容。
2. **运行时轻量：1GB RAM 必须能跑起来**。禁用重量级方案（重型ORM引擎以外的、Redis、MQ、大型监控）；生产用 pm2 fork 单实例；内存缓存要有上限。

## 2. 架构红线（违反即返工）

1. **复用优先**：新增任何功能前先查 `docs/ai/module.md` 模块注册表；已存在则复用或扩展，严禁平行重写。
1b. **首页只走模块**：改首页内容的顺序是「`/admin/modules` 建改模块 → 放积木或代码 → `/admin/home` 入格」。禁止往 `src/app/page.tsx` 堆一次性 JSX；新内置模块必须同时登记 `lib/home/builtins.ts` 与 `HomeModuleRenderer`。
2. **目录不变量**：应用代码只在 `main/`；文档在 `docs/`；`reference/`（第三方主题源码 + 旧站导出 + 私人计划笔记）与 `demo/`（后台 UI 参照稿）**只读不动且不进仓库**——两者已列入 `.gitignore`，只留本机，见 P-092；`main/src/editor/` 是 vendor 冻结子树——**禁止升级其依赖版本或随手重构**，改动必须先说明理由。
3. **SQL 安全**：一律走 Prisma 参数化查询；唯一原生 SQL 在 `lib/search`，LIKE 通配符必须显式转义；严禁字符串拼接 SQL。
4. **评论纯文本**：评论/昵称链路禁止 `dangerouslySetInnerHTML`；正文 MDX 必须过 `lib/markdown/sanitize.ts`（管理员内容也过）。唯一例外是首页自建模块的 `html/css/js`——仅 `requireAdmin` 可写、按用户决策直接注入，**这条路不得扩散到任何其他链路**（docs/pitfalls.md P-034）。
5. **存储可插拔**：所有文件读写只经 `lib/storage` 的 StorageDriver 接口，禁止直接拼 `data/uploads` 路径。
6. **SQLite 单写者**：pm2 只允许 fork 单实例（cluster 多进程写 SQLite 会损坏数据）；备份只用 better-sqlite3 `.backup()` API，禁止直接拷 db 文件。
7. **资源红线**：新依赖引入前评估内存与包体积，必须满足 1GB RAM 运行约束；开发须在 Windows 上实际验证通过。
8. **文档同步**：禁止只改代码不更文档；交付前必须按 `docs/agents-maintenance.md` 触发表同步 docs/README/AGENTS 索引。
9. **面板优先**：普通用户有能力调整的措施都做到后台面板里，留给用户充足的自定义空间。CLI / 环境变量 / 改源码只留给投产初始化、停服换机恢复、部署等面板做不到或不该做的事。

## 3. 目录导航

| 路径 | 内容 | 详情 |
|---|---|---|
| `main/src/app/` | 前台路由 + `/admin` 后台（`admin.css`）+ `/api` 路由 | [docs/architecture.md](docs/architecture.md) |
| `main/src/instrumentation.ts` / `proxy.ts` | 首启/scheduler 注册；Next 16 安全头/CSRF/乐观拦截/限速 | [docs/architecture.md](docs/architecture.md) |
| `main/src/lib/` | db/auth/client/storage（local+COS）/upload/markdown/posts/banner/comments/search/scheduler/backup/update/data-clear/home/layout/release | [docs/ai/module.md](docs/ai/module.md) |
| `main/src/editor/` | mdx-editor vendor 源码（冻结） | [docs/architecture.md](docs/architecture.md) |
| `main/src/components/` | UI 组件（layout/home/home/modules/widgets/post/moment/comment/common/admin，含更新页数据清理弹窗） | [docs/ai/module.md](docs/ai/module.md) |
| `main/prisma/` | schema + migrations + seed | [docs/data-models.md](docs/data-models.md) |
| `main/scripts/` | `boot.cjs` / `install.sh`（Linux 首装一次）/ `pnpm setup` / `pnpm restore` / `pack:update` / `apply-update --file` / `ui-shot.mjs`（`pnpm shot`：**改 UI 后的验证快路径**，对已在跑的 server 截图+量尺寸，不启服务不碰库，见 P-086） | [docs/ai/module.md](docs/ai/module.md) |
| `main/data/` | 运行时数据：blog.db、uploads/、backups/、updates/、backup-host-secret.json（gitignore） | [docs/architecture.md](docs/architecture.md) |
| `changelog/` | 改动清单：按「可提交分组」写文件级说明 + 验证证据，写 commit message / 发行说明时直接摘取（新批次加一个 `*-CHANGELOG.md`）。**只留本机、不进仓库**——内部施工笔记不发布，见 P-092 | [docs/README.md](docs/README.md) |
| `docs/ai/module.md` | **模块注册表（写代码前必读）** | — |
| `docs/home-modules-spec.md` | 首页模块化：格点模型、内置 11 模块、自定义代码边界（改首页前必读） | — |
| `docs/responsive-layout-spec.md` | 双视口自适应：盒子决定内容、电脑/手机两套几何、走手机套含横屏 | — |
| `docs/moments-home-spec.md` | 瞬间首页模块、二级缩略图、宫格展开（改瞬间/首页瞬间模块前必读） | — |
| `docs/backup-restore-spec.md` | 一键恢复：后台预约并在应用内重启 + `pnpm restore`（改恢复前必读） | — |
| `docs/app-update-spec.md` | 程序更新：导入 tar.gz、boot.cjs 覆盖程序文件（改更新前必读） | — |
| `docs/linux-deploy-spec.md` | Linux 精简安装：更新包 + install.sh 一次；以后只换包 | — |
| `docs/backup-encryption-spec.md` | 拆分密钥备份：主机半钥 + 包内半钥、`pnpm setup` | — |
| `docs/cos-storage-spec.md` | 腾讯云 COS：备份上云、媒体双写、访客 thumb 走 COS（改存储/备份前必读） | — |
| `docs/media-layout-spec.md` | 媒体目录树、本地限额、缩略图定位、文章 `/posts/{base62}/{name}` | — |
| `docs/data-clear-spec.md` | 更新页一键数据清理：范围、确认、15 秒闸门与保留边界 | — |
| `docs/admin-ui-rewrite-spec.md` | 后台 UI 重写：独立 CSS、手机底栏、双形态列表；§10 第三轮（冷灰表面 + 6 套可切换配色 + 概览卡片显隐） | — |
| `docs/pitfalls.md` | 已知陷阱 P-001 起递增 | — |
| `docs/api-contracts.md` | API 路由契约 | — |
| `docs/collaboration-workflow.md` | 任务隔离、操作授权、Spec 流程 | — |
| `docs/agents-maintenance.md` | 文档同步触发表（交付前必读） | — |
| `docs/spec-template.md` | 大改动 Spec 空白模板 | — |
| `docs/readme-requirements.md` | README 必备章节清单 | — |
| `docs/user-manual.md` | 站长手册：高级用途与注意事项 | — |
| [ADMIN-REWRITE-PLAN.md](ADMIN-REWRITE-PLAN.md) | 后台按 demo 重写的实施计划（7 阶段；含配色/卡片显隐设计与风险清单） | — |
| `PLAN.md` | 里程碑计划（人为主、AI 辅助） | — |
| `HANDOFF.md` | 历史交接快照（只读，不再维护） | — |

## 4. pitfalls 高频摘要（全文见 [docs/pitfalls.md](docs/pitfalls.md)）

- **P-001 重复造轮子**：不查注册表就新写平行模块
- **P-004 配置多源不同步**：Setting KV 新增字段漏改读写路径
- **P-005 vendor 目录漂移**：升级 editor 依赖或用 `@/` 引项目代码
- **P-006 路径分隔符**：Windows 开发用了 `\` 或 `split('\\')`，Linux 部署炸
- **P-007 高成本操作未授权**：长任务/大量写入未请示
- **P-011 SQLite 并发误用**：cluster 模式 / 直接拷 db 文件备份
- **P-013 模糊措辞**：报告里写「大概/应该」而不给具体数值
- **P-015 改代码未同步文档**：交付前没走 agents-maintenance 触发表
- **P-016 原生驱动双版本**：Prisma adapter 带入旧 better-sqlite3，Windows Node 24 缺 binding
- **P-017 Next 16 约定**：使用 `src/proxy.ts`；关闭 `agentRules` 防止生成第二套规则
- **P-020 MDX JSX 消毒**：Video/Audio 先转白名单 HAST 再 sanitize；组件禁展开未知 props
- **P-021 vendor tsc**：`src/editor` 排除出应用 tsc；Turbopack 别名用相对路径
- **P-022 编辑器全局 CSS**：只从 admin layout 引入 vendor `globals.css`
- **P-023 评论蜜罐/pending**：蜜罐 200 不落库；游客不直接可见
- **P-024 搜索 LIKE**：通配符必须 `escapeLike`；原生 SQL 只在 `lib/search`
- **P-026 备份**：只用 `.backup()`；文件名白名单；uploads 走 StorageDriver
- **P-027 编辑器工具栏**：必须纵向 flex，禁止工具栏与正文并排占 1/3
- **P-028 正文视频**：`insertJsx$` + 可更换删除；保存前归一成 `<Video />`
- **P-029 编辑器深色**：只在 `admin.css` 覆盖 `--base*`，禁止改 vendor 换肤
- **P-030 编辑器预览**：不要平行重写；标题字号写 `.admin-mdx-prose`；成稿预览走 `/api/admin/preview`
- **P-031 文章目录**：必须收 h1–h6（编辑器「标题 1」是 `#`）；点击平滑滚动，禁止只收 h2–h4
- **P-032 媒体插入**：弹窗 portal 到 body；禁止工具栏内 absolute 下拉（会被编辑器挡住）
- **P-033 后台分栏滚动**：锁视口 + 各栏独立滚动；收起按钮用右上角 chevron
- **P-034 自定义模块代码**：管理员内容面，直接注入不过 sanitize；禁止扩散到评论/正文
- **P-035 改首页**：只走模块目录 + 首页管理，禁止往 `page.tsx` 堆 JSX
- **P-036 格点样式**：只输出 `--cell-*` / `--m-cell-*` CSS 变量，禁写 inline `grid-column`
- **P-037 首页纵向布局**：`rowSpan` 恒为 1，靠「同格堆叠」，禁用 CSS Grid 行跨越
- **P-053 盒子决定内容**：模块高度走 `hPct`，禁止内容固有高度撑开固定格；电脑/手机两套几何；走手机套含横屏 `hover:none + max-height`
- **P-054 手机拆格叠层**：`display: contents` 后格子必须自己 `position: relative; z-index`，否则 hug widget 会被固定底图盖住
- **P-038 恢复备份**：禁止 Prisma 连库时覆盖 `blog.db`；预约后未到 `restartAt` 不覆盖；到点或「立刻重启」才退出进程；CLI 须先停进程
- **P-042 面板优先**：用户能自己调的都进后台，不要只做成 CLI / 改 env / 改源码
- **P-043 画布拖动捕获**：预览会卸掉被拖模块，`setPointerCapture` 必须挂画布，不能挂手柄
- **P-044 后台动效字号**：只走 `--admin-*`（切页/折叠 ≤280ms；**标题 16 / 卡片与区块标题 14 / 正文 14**——2026-02 按参照稿 `demo/admin-ui/index.html` 降档，**原为 21 / 17 / 15**）；危险提示 `.admin-danger`；stagger 入场 460ms 是唯一例外。登录页标题单独钉 21px（独立卡片、参照稿无对应物）。**改这三个 token 前先量参照稿，别按印象调**
- **P-039 备份拆分密钥 / 账号**：DEK = 主机半钥 XOR 包内半钥；口令在后台备份页（或 `pnpm setup`）设一次且不可改；不设无法做加密备份；不硬编码账号
- **P-040 主题防闪烁**：禁止在 `layout.tsx` 写 `<script>`；只走 `ThemeInit` + `useServerInsertedHTML`
- **P-041 备份加密可开关**：明文与加密走同一套落盘/列表/COS/恢复；COS HTTPS 且未手设时默认关加密
- **P-045 强制改密拦 API**：`requireAdmin()` 必须查 `mustChangeCredentials`，不能只拦页面
- **P-046 XFF 第一跳**：限速 IP 优先 `X-Real-IP`，禁止信 `X-Forwarded-For` 客户端自报的第一跳
- **P-047 密码文评论**：未解锁不得用评论 API 读/写该文
- **P-048 公开缓存**：禁止把 `getPublishedPostContent` 或解锁正文放进 `unstable_cache`
- **P-049 COS**：密钥只进后台 Setting；原图/音视频/访客 thumb 直链 COS；备份（加密或明文）均可上私有 `backups/`
- **P-050 媒体目录 / 文章 URL**：本地与 COS 同一套分片 key；改首页外文章地址只走 `postHref`；旧 `/posts/{slug}` 301
- **P-051 二级缩略图**：只本地 `images/thumbs2/{hh}/{hash}.webp`；禁止写进瞬间 JSON；缺文件回退一级；`isThumbKey` 不得把 `thumbs2` 当成一级
- **P-052 媒体库删除**：默认同时删本地原图+一/二级 thumb+COS；下拉可选仅本地；关联文章警告仍可删，不要再 409 卡死
- **P-055 版本角标**：前台页脚左下角与后台侧栏左下角只标 `lib/release.ts` 的 `APP_RELEASE_LABEL`（现为 0.1.1）
- **P-056 上传两步**：写文章只入库本地原图；点发布才生成 thumb 并上 COS；图片超 10MB 先警告再按原格式压缩，禁止直接 413
- **P-057 灯箱缩放**：滚轮/双指只走 `Lightbox` + `lightbox-zoom.ts`，禁止手势库；舞台按原图像素再 scale，禁止画进缩略图盒子；关闭灯箱不要 revoke 原图 blob
- **P-058 评论默认收起**：`CommentSection` 默认 `collapsible`；文章/瞬间/留言板都要点开才展开，不要再给文章/留言板做展开特例
- **P-059 文章阅读侧栏**：阅读页默认只显示目录，其余卡片靠右侧按钮展开；列表/分类等页保持全展开，不要平行写第二套 widget
- **P-060 首页加载进度**：大图解码超过 2 秒才走 `TransferHud`（`startHomeLoad`）；满格后自动关掉；禁止再做一条顶栏进度条；后台画布预览关掉 `trackLoad`
- **P-061 next/image 透传**：自定义 loader 禁止往 URL 拼 `w=`（COS 可能当云处理）；`images.unoptimized=true`，不要为消警告去实现假的 width 缩放
- **P-062 运行时间只走模块**：站点运行时间是内置 `uptime` 模块；开始时间只进 Setting `siteStartedAt`；空则前台不渲染，禁止写进 `page.tsx`
- **P-063 写文章左栏折叠**：设置卡片收起后只留标题；左栏 Grid 必须 `align-content:start`，禁止 stretch 把收起块撑成方块
- **P-064 程序更新**：只走 `boot.cjs` 在拉起 Next 之前覆盖；boot 调用的 TS 脚本禁止顶层 await；禁止把 `data/`/`.env` 打进包；与预约恢复互斥；正规包必须是完整 `src/`；生产构建 `NODE_OPTIONS=--max-old-space-size=768`
- **P-065 发版只换包**：空机跑一次 `install.sh`；以后只导 `tar.gz`（后台或 `--file`），不要改安装脚本、不要上传 Windows 的 `node_modules`
- **P-066 拒绝名单打包 / GitHub / 站点名**：打包不要再写允许清单；GitHub 只后台点检查；`siteName` 禁止默认 MyBlog，创建时手填
- **P-068 数据清理安全边界**：15 秒必须由服务端闸门执行；只删选定数据并保留配置；清理期间禁止备份竞态
- **P-070 后台样式隔离**：后台 CSS 只进 `admin.css`；不得重定义 `.heo-button` / `.form-field` / `.heo-card`
- **P-071 motion 仅后台**：`from "motion` 只许出现在 `src/components/admin/`；必须 `LazyMotion` + `domAnimation`
- **P-072 后台列表双形态**：同一套 DOM 桌面表格/手机卡片，禁止表格横滑糊弄竖屏
- **P-073 写文章设置 sheet**：手机箭头/背板必须关 sheet，禁止复用桌面收起左栏；工具栏窄屏两行换行须全部可见，禁止裁切或藏滚动条横滑
- **P-074 数据清理弹窗**：独立圆角卡片 + 进度条贴底，禁止套进 AdminDialog 手机 sheet
- **P-075 清空管理员后重建**：创建页按主机半钥分派；setup 路由必须 import `hostSecretExists` / `adminRecoverySchema`
- **P-076 后台配色挂 :root**：改后台颜色只动 `admin.css` 的 `:root` / `:root[data-theme="dark"]`；禁止改 `--heo-*`；弹窗 portal 到 body，token 不能挂 `.admin-workspace`。多配色的色值集中在 `lib/admin/accents.ts`，由 `admin/layout.tsx` 服务端注入 `:root:root`；**每套必须给浅色/暗色两套锚点**（暗色下用深色锚点混出的文字只有 1.2:1）
- **P-077 标识符先验证再写**：类名与 admin.css 逐个比对（缺失必须为 0——裸引用不报错，只静默丢样式）；import 路径用 glob 确认；图标名查 Radix 的 `index.d.ts`。**CSS 动效时长 token 定义在 `globals.css`**（`--admin-fast/mid/slow` = 160/220/280ms + `--admin-ease`，前后台共享），别在 `admin.css` 里另造一个同名 token 把全后台时长改错。**工具输出也要交叉验证**：pwsh 输出中文乱码不代表文件坏了（用 Read 复核），`Measure-Object -Line` 计数不准（实测把 4444 行数成 3830），被 `Select-Object -First N` 截断的 grep 结果不能当全量（实测把 23 处说成 2 处）
- **P-086 UI 验证走 `pnpm shot`**：一条命令出图+量尺寸（**2.6s 返回**），只对着**已经在跑的** server、复用浏览器 profile、不碰数据库。**禁止把 `tsc --noEmit` / `next build` / 起 dev server 跟截图写进同一条命令**（那是把几十秒到几分钟的冷启动成本叠加进来）。**`spawn` 出来的浏览器必须 `child.unref()` + `child.kill()`**：不 unref 会让脚本干完活也不退出，调用方一直等到被人工掐断（Windows 上 `process.kill(-pid)` 不支持负 PID，别用它杀进程组）。详见 [docs/pitfalls.md](docs/pitfalls.md)
- **P-087 `updatedAt` 不是「作者改过的时间」**：`@updatedAt` 会被浏览量自增、定时发布、publicId 回填刷成"现在"。文章页「已修改」用独立的 `Post.revisedAt`（`updateAdminPost()` 只在**已发布 + 仍发布 + 读者可见字段真变了**时写，逐字段比对，不算状态/置顶/推荐/浏览量），显示开关是 `Post.showRevisedAt`
- **P-088 三列 grid 页脚：列位写死，别靠子节点顺序**：中间那列是「站点运行时间」模块，`siteStartedAt` 为空时它 `return null`（DOM 里没节点），右栏文案会掉进中间列 → `.site-footer__left{grid-column:1}` / `p:last-child{grid-column:3}`，手机档 `text-align:right`
- **P-089 跨表数据进了 `cachedPublic`，写入侧必须"立即过期"**：`revalidateTag(tag, "max")` 是 SWR（先给旧值），`revalidatePath("/具体路径")` 才立即生效。公开页依赖另一张表的字段（如作者署名依赖 `AdminUser.penName`）时，写入侧补 `revalidateTag(tag, { expire: 0 })`；**别用 `updateTag()`**（Route Handler 里直接 throw）
- **P-090 变体按钮文字色别在暗色块里族级统一钉**：`[data-theme="dark"] .admin-btn` 是 (0,2,0)，会盖掉 (0,1,0) 的 `.admin-btn--ghost/--link`，而暗色 `--admin-on-accent` 是近黑 → 没底色的按钮在深色下 1.08:1 看不清。族级颜色改动先算权重；vendor token 名会骗人（`--baseBorderHover` 在 editor 里只当文字色用）。自检走 CDP 对比度审计（暗色遍历 `.admin-workspace *` 合成背景算 WCAG），别靠眼睛
- **P-091 浮层被盖住先给两边分层，别只加浮层 z-index**：编辑器工具栏是 flex 项、`z-index:6` 照样生效，会跨子树压掉标题行里 `z-index:5` 的 ⓘ 说明卡（实测 5 个取样点 4 个被挡）。修法：标题行 `z-index:2` + 编辑区 `z-index:1`（各自成栈上下文）；验证走 `elementFromPoint` 五点取样，修后 0/5 被挡
- **P-092 从远端撤私密内容**：撤内容前先在**仓库之外**备份（`--all` 会把同一仓库里的备份分支一起重写）；`filter-branch` 收尾会把工作区重置成重写后的 HEAD（文件会被从磁盘删掉）；**验证通过前禁止 `gc --prune=now`**；删远端仓库需 token 带 `delete_repo`（GCM 默认没有）；验证别用含糊的 `main`（与同名目录冲突，失败命令的空输出会被误读成"命中 0"）。**远端只留程序代码 + 项目文档**：`reference/`、`demo/`、`changelog/` 已在 `.gitignore`，只留本机

## 5. 工作流底线

- **先读后动**：新会话 = 第一天上班。动手前读本文件 + 按任务读 `docs/ai/module.md` + `docs/pitfalls.md`；不清楚就提问或复述理解待确认，不得自作主张。
- **定位优先回查**：每次需要定位代码、文档、配置或模块，或对项目结构、既有决策、实现方式有任何不确定时，先回查本文件的目录导航、规则与状态摘要，再按索引进入对应 `docs/` 或源码目录，最后用 `rg` 精确确认符号和调用链；不得仅凭模型记忆猜路径、猜实现或在全项目无目的扫描。后续新会话也必须沿用此定位顺序。
- **任务隔离**：同一会话不混做设计/实现/修 bug/写报告；纠缠超 ~10 轮仍不清晰 → 拆分任务。
- **影响面分析**：改代码前先输出涉及模块、配置同步点、是否破坏红线、将更新哪些文档。
- **交接文档冻结**：`HANDOFF.md` 仅作历史参考，不再修改；其他文档仍按 `docs/agents-maintenance.md` 触发表维护。
- **高成本操作授权**：生产部署、数据库迁移执行、批量删除、大文件操作——只给命令，用户亲自执行；smoke test 可做但须标注。
- **Spec 驱动**：大改动（触及 ≥3 源码文件 / 改数据流 / 新增依赖 / 新增档案产物）先写 Spec 获批再写代码。

## 6. 状态摘要

- 当前阶段：**第三轮后台重写进行中**（见 [ADMIN-REWRITE-PLAN.md](ADMIN-REWRITE-PLAN.md)）——冷灰表面 + 6 套可切换配色（默认石墨；色值事实源 `lib/admin/accents.ts`，服务端注入 `:root:root`）、侧栏分 4 组、概览页重写为 7 张可显隐卡片（Setting `dashboardCards` + `adminAccent`，各三处同步）、**「外观」入口在前台导航 `Navbar`**（`SiteHeader` 服务端读 session 判定管理员，访客拿到的 HTML 里没有它；点击带 `?appearance=1` 进后台并自动展开**右上角弹窗**，面板样式仍在 `admin.css`，前台不引入它。开关**从 URL 派生**，不用 state——见 P-079）——**后台标题行 `.admin-topbar` 不放任何额外按钮**（只有返回、标题、用户名），「概览卡片」区块只在概览页显示。已完成 token / 基元 / 布局壳 / 概览页；列表页与表单页随 token 自动跟随；写文章页与弹窗已随 token 对齐。**质感对齐已完成**（2026-02，逐项量参照稿后改）：侧栏节奏与字号、KPI 彩色语义图标 + 数值字重、徽章语义色五档（ok/warn/danger/info/muted）、阴影三式（含 -20/-28px 负扩散）、卡片内边距 18/20、按钮层次（ghost 中性化、去主色光晕）、列表表头与行距、全局焦点环、空态、输入框统一 38/9、圆角归并到 token、外观面板 240/12/12。此前：后台 UI 重写（独立 `admin.css`、手机底栏、双形态列表、写文章 sheet）、M10 数据清理、M9 程序更新与 M8 首页模块化已完成，本地发行 0.1.0；**本轮（第三轮后台重写质感对齐、作者与文章时间口径、卡片与登录链路修复）已提交为发行 0.1.1**（`changelog/` 三份清单即本版更新说明）；M7 上机部署由用户执行
- 已证伪/否决路线：Lucia（停止维护）、自写 JWT、Drizzle、public 目录运行时写上传文件、系统 tar 打包、pm2 cluster、整包拷贝 theme-hao 的 zhheoblog.css、Halo 编辑器（Vue 3 + GPL-3.0，且产出 HTML 与本项目 MDX 管线不兼容）、`react-grid-layout` 等重型拖拽库、CSS Grid 行跨越做侧栏列
- 编辑器 vendor 基线：mdx-editor v4.2.3（MIT）

## 7. 文档体系与人机分工

| 事项 | AI | 用户 |
|---|---|---|
| 读文档、写代码、smoke test、文档同步 | ✅ | — |
| 高成本操作（部署、迁移、批量删除） | 只给命令 | ✅ 亲自执行 |
| 大改动 Spec、方案落档 | 起草 | ✅ 确认后执行 |
| 需求不清 | 提问、复述 | ✅ 澄清 |
| 计划方向（PLAN.md） | 辅助 | ✅ 主责 |

## 8. 交付前检查清单

**代码**
- [ ] 已查 `docs/ai/module.md`，未重复造轮子
- [ ] 未破坏红线（存储接口/SQL 参数化/评论纯文本/vendor 冻结/单实例）
- [ ] 新配置字段已同步全部读写路径
- [ ] Windows 上 `pnpm dev` 实际跑过、功能验证过
- [ ] 未私自执行高成本操作

**文档同步**（对照 `docs/agents-maintenance.md` 触发表）
- [ ] 已更新本任务触发的全部 docs
- [ ] 用户可见功能已更新 README
- [ ] 新坑已写入 `docs/pitfalls.md`（P-0XX 递增）
- [ ] 新增/删除源码文件已同步 `docs/ai/module.md` + AGENTS §3 导航
- [ ] 回复中列出已同步的文档路径
