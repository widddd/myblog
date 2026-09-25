# data-models.md — 数据模型（Prisma）

> schema 变更时同步本文件。源文件：`main/prisma/schema.prisma`。状态：✅ M1 schema 已落地；M2 seed 写入 10 篇演示文章（含密码/定时/草稿各 1）+ 3 分类 + 5 标签 + 2 瞬间，幂等（已有文章则跳过）。M4 使用现有 Comment 表，无迁移。M5 为 Post 增加 `bannerStyle`/`bannerColor`/`bannerColor2`（迁移 `20260829140232_post_banner_style`）。M6 不改 schema：`lastBackupAt` 由备份任务写入既有 Setting KV。M7 打磨为 Post 增加 `recommend`（迁移 `20260829145300_post_recommend`），与 `pinned` 独立，控制首页推荐位。M8 首页模块化新增 `HomeModule` / `HomePlacement`（迁移 `20260830031022_home_modules`），布局不进 Setting KV。备份加密新增 `BackupSecret`，管理员增加 `mustChangeCredentials`（迁移 `20260830040000_backup_secret_admin_must_change`）。文章前台地址新增 `Post.publicId`（迁移 `20260830080000_post_public_id`）。首页双视口几何：`HomePlacement.hPct` 与 `mobileCol/mobileColSpan/mobileRow/mobileHPct`（迁移 `20260830100000_home_dual_viewport`）。文章页「已修改」新增 `Post.revisedAt` 与 `Post.showRevisedAt`（迁移 `20260925161921_post_revised_at`）：`revisedAt` **不是** `updatedAt`（浏览量自增/定时发布/publicId 回填都会刷 `updatedAt`，见 P-087），只由 `updateAdminPost()` 在文章已发布且读者可见字段真的变了时写入。作者功能再新增 `Post.authorName`、`AdminUser.penName` 与 `PenName` 表（迁移 `20260925173000_post_author_pen_name`）：`PenName` 只存 `name`（唯一；没有 slug —— 作者没有独立页面），写文章页的作者下拉读它；`AdminUser.penName` 是默认笔名，文章没单独填作者时前台显示它。

## 模型一览

### Post（文章）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int @id autoincrement | 后台编辑仍用这个数字 id |
| publicId | String @unique | 8 位 base62，前台 `/posts/{publicId}/{name}` |
| slug | String @unique | 链接名；空则段名 `article`；旧 `/posts/{slug}` 301 |
| title | String | |
| content | String | MDX 正文（编辑器产出） |
| excerpt | String? | 摘要（密码文对外不返回） |
| cover | String? | 封面图 URL（列表卡与 `bannerStyle=cover` 的详情顶图） |
| bannerStyle | String | `cover` / `solid` / `gradient`，默认 `cover` |
| bannerColor | String? | 纯色或渐变起始色 `#RRGGBB` |
| bannerColor2 | String? | 渐变结束色 `#RRGGBB` |
| passwordHash | String? | 有值即密码文章（bcrypt） |
| status | String | `draft` / `scheduled` / `published` |
| publishedAt | DateTime? | 定时发布时间；前台查询条件 `status=published AND publishedAt<=now` |
| pinned | Boolean | 置顶（列表排序优先） |
| recommend | Boolean | 首页推荐位；前台最多取 6 篇，按 publishedAt 倒序。一篇都没勾选时回退最新已发布 |
| views | Int | 浏览量 |
| authorName | String? | 文章作者（笔名）。为空 = 前台回落管理员账号的默认笔名（`AdminUser.penName`），两边都空则不渲染作者。创建文章时服务端会用默认笔名兜底；改作者算"读者可见改动"，会写 `revisedAt`（P-087） |
| revisedAt | DateTime? | **作者改动时间**（前台「已修改」用它，不是 `updatedAt`）：只在「改动前已发布 + 改完仍是已发布 + 标题/正文/摘要/封面/作者/分类/标签等读者可见字段真的变了」时由 `updateAdminPost()` 写一次；为空或早于 `publishedAt` 时前台不显示 |
| showRevisedAt | Boolean 默认 true | 文章页是否显示「已修改 + 修改时间」，在写文章页设置栏「发布」组内关（P-087） |
| categoryId | Int? → Category | |
| tags | PostTag[] m2m | |

### Category（分类）/ Tag（标签）
slug 唯一、name；Tag 通过 PostTag 与 Post 多对多。

### PenName（笔名清单）
| 字段 | 说明 |
|---|---|
| name | String @unique，笔名（作者显示名） |
| createdAt | DateTime |

只存名字：作者没有独立页面（不像分类/标签那样有 `/categories/{slug}`），所以不做 slug。
写文章页的「作者」用 `<input list>` + `<datalist>` 读这份清单下拉快捷选，也能直接打字自定义；
当场新建走 `POST /api/admin/pen-names`。**默认作者不在这里，而在 `AdminUser.penName`**（见下）。

### Moment（瞬间）
content（文本）、images（JSON：`[{key,thumb,width,height}]`）、createdAt。

### MomentLike（点赞）
momentId + fingerprint（IP+UA 哈希）联合唯一，防重复点赞；公开 POST 翻转（已赞则删除）。

### Comment（评论）
| 字段 | 说明 |
|---|---|
| targetType | `post` / `moment` / `board`（留言板 targetId 固定 0） |
| targetId | Int |
| nickname | String（纯文本） |
| email | String?（仅格式校验，不回显 HTML） |
| content | String 纯文本，React 转义渲染 |
| parentId | Int?（两级嵌套：父评论必为顶层） |
| status | `pending` / `approved` |
| isAdmin | Boolean（管理员回复） |

### Setting（站点配置 KV）
key 唯一、value（JSON string）。默认值单一事实源为 `main/src/lib/settings.ts`：`siteName=""`（创建站点时手填，禁止默认 MyBlog）、`announcement=""`、`banner=""`、`pageSize=10`、`backupPeriodDays=3`、`backupKeep=5`、`backupLocalMaxMB=512`、`localMediaMaxMB=512`、`uploadMaxSizeMB=10`、`thumbMaxPx=480`、`thumb2MaxPx=320`、`homeModuleOpacity=32`、`homeBackdropOpacity=100`、`siteUrl=""`、`siteStartedAt=""`、`updateGithubRepo=""`、`adminAccent="graphite"`（6 套预设之一，单一事实源 `main/src/lib/admin/accents.ts`）、`dashboardCards`（7 个卡片键全 true，单一事实源 `main/src/lib/admin/dashboard-cards.ts`）、`lastBackupAt=null`、`cosBucket/cosRegion/cosSecretId/cosSecretKey/cosPublicBaseUrl` 默认空串。COS 五项与密钥**禁止**进入公开设置。`siteStartedAt` 是本地日期时间（可到秒），给首页 `uptime` 模块用，**要进** `getPublicSettings`；空则前台不显示运行时间。`backupEncrypt` **不**进默认表、不进设置表单：用户未在备份页手设时，COS 访问为 HTTPS 则默认关加密，否则默认开加密。`localMediaMaxMB` 只约束本地媒体缓存，与备份上限分开。`siteUrl` 给 sitemap/RSS/OG；空则回退 `SITE_URL` 环境变量，再回退 `http://localhost:3000`。只接受 `https` 或本机 `http://localhost` / `127.0.0.1`。

### AdminUser（单管理员）
username 唯一、passwordHash（bcrypt cost 12）、mustChangeCredentials（历史首次登录保护，默认 true）、`penName`（默认笔名，可空）。投产用创建站点页或 `pnpm setup` 手设站点名称、用户名/密码并写 `mustChangeCredentials=false`。无管理员时前台与 `/admin` 引导到 `/admin/setup`，bootstrap 只告警。之后可在「设置 → 登录账号」再改（含笔名；改笔名会立即让所有"没单独填作者"的文章换署名 —— 写入侧显式 `revalidateTag(posts, { expire: 0 })`，见 P-089）。instrumentation 与 Prisma seed 复用同一幂等 bootstrap（不代建管理员）。

### BackupSecret（备份密钥哈希）
| 字段 | 说明 |
|---|---|
| name | 备份文件名，主键，白名单为本机生成包 `myblog-YYYYMMDD-HHMMSS.tar.gz` 或上传包 `myblog-import-...` |
| keyHash | 该备份合成后 DEK 的 SHA-256 hex；**不存半钥、不存口令** |
| algo | 目前固定 `aes-256-gcm` |
| createdAt | 记录写入时间 |

新备份的完整 DEK 不进包、不进库：本机 `data/backup-host-secret.json` 的主机半钥与包内 `half` XOR 后得到 DEK，再与本表做 `timingSafeEqual`。v1 旧包仍可能带明文 `key`，仅只读兼容。

### Upload（上传文件）
hash（完整 SHA-256，同内容去重）、driver（`local` / `cos`，历史值 `oss` 当 `cos`）、key（原文件 POSIX 相对 key）、mime、原图 width/height/size、createdAt（媒体库默认按此倒序）、variants（JSON：thumb/thumb2/content 的 key、MIME、宽高与大小；音频可有 `duration` 秒）。新上传走 `images/original|thumbs|thumbs2/{hh}/{hash}.*` 与 `videos|audio/{ext}/{hh}/{hash}.{ext}`；`thumbs2` 只留本地。旧 `media/` 与 `images/{hash}-*` 仍可读。详见 [media-layout-spec.md](media-layout-spec.md)。

M3 使用现有字段即可，未新增 schema 或迁移。后台删除文章/瞬间时会显式清理对应 `Comment` 行（schema 对评论没有 Post/Moment 外键）。

M4 同样不改 schema：游客评论 `pending`，管理员回复 `approved`+`isAdmin`；拒绝待审=删除。公开列表不回显 email/ip。

### HomeModule（首页模块目录）
| 字段 | 说明 |
|---|---|
| slug | String @unique。内置固定为 key，自建为 `custom-<slugify(name)>` |
| name | 显示名 |
| kind | `builtin` / `custom` |
| builtinKey | `banner`/`welcome`/`recommend`/`moments`/`posts`/`announcement`/`site`/`categories`/`tags`/`recent`/`uptime`，仅 builtin |
| html / css / js | 仅 custom，各上限 32KB，只有管理员能写且不过 sanitize（pitfalls P-034） |
| blocks | JSON `HomeBlock[]`，仅 custom；读取时按已知 type 过滤 |
| config | JSON 实例配置；读取时与 `lib/home/builtins.ts` 的默认值合并 |
| system | 内置为 true：不可删除、不可改 key、不可写代码，只能关闭 |

### HomePlacement（首页格点）
| 字段 | 说明 |
|---|---|
| moduleId | Int @unique → HomeModule，onDelete Cascade。一个模块在首页最多出现一次 |
| enabled | 关掉即前台不渲染，模块仍留在目录里 |
| col / colSpan | 1–12，**桌面**横向位置；`col + colSpan` 不得越过第 12 列 |
| row | ≥1，桌面行带编号 |
| hPct | 0–100，桌面高度占设计视口的百分数；0 = 随内容（hug） |
| mobileCol / mobileColSpan / mobileRow / mobileHPct | 手机套几何，含义同上 |
| rowSpan | **保留字段，恒为 1**。纵向靠「同格堆叠」表达（pitfalls P-037） |
| sort | 同格堆叠顺序；保存时按桌面 `row, col` 重算 |

默认 11 个内置模块与格点由 `ensureHomeModules()` 幂等写入，首启（instrumentation）与 `pnpm db:seed` 复用同一函数。默认布局：Banner 满宽第 1 行；欢迎/瞬间第 2 行各占 6 列（推荐文章默认关闭）；文章卡第 3 行占 1–9 列；公告/站点/分类/标签/最近发布堆在第 3 行 10–12 列；运行时间第 4 行满宽居中（`siteStartedAt` 为空则前台不渲染）。首次补建 `moments` 时会关掉已有 `recommend` 格点（只一次）。已有站点下次启动只补缺失 slug，不覆盖用户改过的格点。

## 不变量

- 删除 Post 时级联删除 PostTag/Comment(targetType=post)；删除 Moment 级联 MomentLike/Comment
- `(row, col, colSpan)` 相同的 HomePlacement 归为同一个格子并纵向堆叠；同行横向重叠时后者整体下移一行
- 删除 HomeModule：`system=true` 一律拒绝（409）；custom 仍在首页启用中也拒绝（409），需先在首页管理里移除
- 密码文章的 content/excerpt 在一切对外查询投影中排除（pitfalls P-012）
- Comment.parentId 引用的父评论必须同 targetType+targetId
