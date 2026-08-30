# data-models.md — 数据模型（Prisma）

> schema 变更时同步本文件。源文件：`main/prisma/schema.prisma`。状态：✅ M1 schema 已落地；M2 seed 写入 10 篇演示文章（含密码/定时/草稿各 1）+ 3 分类 + 5 标签 + 2 瞬间，幂等（已有文章则跳过）。M4 使用现有 Comment 表，无迁移。M5 为 Post 增加 `bannerStyle`/`bannerColor`/`bannerColor2`（迁移 `20260829140232_post_banner_style`）。M6 不改 schema：`lastBackupAt` 由备份任务写入既有 Setting KV。M7 打磨为 Post 增加 `recommend`（迁移 `20260829145300_post_recommend`），与 `pinned` 独立，控制首页推荐位。

## 模型一览

### Post（文章）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int @id autoincrement | |
| slug | String @unique | URL 标识 |
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
| categoryId | Int? → Category | |
| tags | PostTag[] m2m | |

### Category（分类）/ Tag（标签）
slug 唯一、name；Tag 通过 PostTag 与 Post 多对多。

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
key 唯一、value（JSON string）。默认值单一事实源为 `main/src/lib/settings.ts`：`siteName=MyBlog`、`announcement=""`、`banner=""`、`pageSize=10`、`backupPeriodDays=3`、`backupKeep=5`、`uploadMaxSizeMB=10`、`lastBackupAt=null`。

### AdminUser（单管理员）
username 唯一、passwordHash（bcrypt cost 12）。首启时由 `ADMIN_USERNAME`（默认 admin）与 `ADMIN_INIT_PASSWORD` 环境变量初始化；instrumentation 与 Prisma seed 复用同一幂等 bootstrap。

### Upload（上传文件）
hash（完整 SHA-256，同内容去重）、driver（local/oss）、key（原文件 POSIX 相对 key）、mime、原图 width/height/size、variants（JSON：thumb/content 的 key、MIME、宽高与大小）。图片写 original + 480px WebP thumb + 最长边 1600px WebP content；视频只写 original。

M3 使用现有字段即可，未新增 schema 或迁移。后台删除文章/瞬间时会显式清理对应 `Comment` 行（schema 对评论没有 Post/Moment 外键）。

M4 同样不改 schema：游客评论 `pending`，管理员回复 `approved`+`isAdmin`；拒绝待审=删除。公开列表不回显 email/ip。

## 不变量

- 删除 Post 时级联删除 PostTag/Comment(targetType=post)；删除 Moment 级联 MomentLike/Comment
- 密码文章的 content/excerpt 在一切对外查询投影中排除（pitfalls P-012）
- Comment.parentId 引用的父评论必须同 targetType+targetId
