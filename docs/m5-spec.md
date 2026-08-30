# Spec：M5 搜索 / 瞬间互动 / 定时发布 + 前台动效与发文体验

- 日期：2026-08-29
- 提案人：AI
- 状态：已实施（用户本会话要求完成 M5，并改发文/Banner/导航/首页滚动交互）

### 1. 目标

完成 PLAN.md M5：LIKE 转义搜索 + ⌘K 对话框 + 结果页；瞬间瀑布流/九宫格/点赞去重（评论沿用 M4）；scheduler 定时发布（启动补偿 + 每分钟扫描）。

同期前台/后台体验：发文可导入 `.md`/`.mdx`；文章页顶 Banner 可选封面图 / 纯色 / 双色渐变；导航切换时顶栏极细天蓝进度条 + 活动项底色平滑滑动；首页 Banner 滚动时图片固定并渐模糊，主题色半透明幕布叠上，卡片再叠一层透明玻璃；首页顶栏未滚动时隐藏主题按钮，下滑后平滑挤出。

**本里程碑不做**：备份系统（M6）、OssDriver、公开文章 REST、重量级动画库。无新 npm 依赖。

### 2. 设计方案

| 项 | 做法 |
|---|---|
| 搜索 | 唯一原生 SQL 在 `lib/search`；`escapeLike` 转义 `\ % _`；`ESCAPE char(92)`；密码文只匹配 `title`，结果不含 content/excerpt |
| ⌘K | `SearchDialog` 调 `GET /api/search`（频控 60 次/分/IP）；结果页 RSC 直调 `searchPosts` |
| 瞬间 | `lib/moments/query.ts` 列表含点赞数/是否已赞；图片 1～9 张九宫格；卡片 CSS columns 瀑布流；`POST /api/moments/[id]/like` fingerprint 联合唯一翻转 |
| 定时发布 | `scanScheduledPosts()`：`scheduled AND publishedAt<=now` → `published`；instrumentation 启动立即跑一次 + 60s interval；回调 try/catch（P-010）；前台仍 `publishedWhere()` 双保险 |
| MD 导入 | 浏览器读文件（≤1MB），不经 `/api/upload`（避免魔数校验）；可选 YAML frontmatter 填 title/slug/excerpt；`EditorLoader` 用 key 重挂载 |
| 文章 Banner | Post 增 `bannerStyle`/`bannerColor`/`bannerColor2`；封面图沿用 `cover`；纯色/渐变只作用于详情顶图，列表卡仍用封面 |
| 导航动效 | 点击站内链显示 2px 天蓝 `scaleX` 进度条；`site-nav` 绝对定位 indicator 跟活动项 left/width |
| 首页滚动 | 背景图 `position:fixed` 不随滚动上移；`--home-blur`/`--home-veil` 跟 scrollY；幕布用 `--heo-background` 半透明；卡片再降不透明度 |

复用：`publishedWhere`、`rateLimit`、`fingerprint`、`requireAdmin`、CSRF、`StorageDriver.getUrl`、`Lightbox`、`CommentSection`、`fetchCsrfToken`。不平行重写搜索/限速/存储。

### 3. 影响面分析

- **涉及模块**：search、scheduler/publish、moments/query、posts admin/query/validation、Navbar/ThemeToggle/HomeBanner、PostEditorForm、SearchDialog、NavigationProgress
- **新增/变更配置字段**：无 Setting KV；Post 三列 banner 字段（schema 默认值即可，旧行自动 cover）
- **是否破坏红线**：否。LIKE 只在 `lib/search` 且转义；评论纯文本未改；vendor 未动；无 Redis；1GB 内无新依赖
- **是否新增依赖**：无

### 4. 输入输出边界

- `GET /api/search?q&page`：分页命中；密码文仅标题；空 q 返回空列表
- `GET /api/moments?page`：瞬间流（点赞数 + liked）
- `POST /api/moments/[id]/like`：CSRF；fingerprint 去重翻转；429 频控 20 次/分/IP
- 文章 POST/PATCH 增加 `bannerStyle`/`bannerColor`/`bannerColor2`
- 迁移：`Post.bannerStyle` 默认 `cover`，颜色可空 `#RRGGBB`

### 5. 实施步骤

1. schema 迁移 + zod + admin/query 读写
2. search service + API + 结果页 + SearchDialog
3. moments query + like API + 瀑布流/九宫格 UI
4. scheduler publish + 注册
5. 编辑器 MD 导入 + Banner 选择；详情页顶图
6. 导航进度条/滑动底色；首页固定模糊幕布；主题按钮延后出现
7. 单测 + 文档同步

### 6. 验收标准

- 搜索 `%`/`_` 按字面匹配，不扩大结果；密码文正文命中不出现在结果里，标题命中只回标题
- ⌘K 打开对话框；选结果进入文章页
- 同一指纹重复点赞只落 1 行 MomentLike；再点取消
- 将一篇 `scheduled` 的 `publishedAt` 改为过去，等扫描或重启后 `status=published`，前台可见
- 导入带 frontmatter 的 md 后编辑器正文与标题被填充
- 文章 Banner 三种模式在详情页可见；列表卡仍显示封面
- 导航切换：顶栏 2px 天蓝进度条平滑走完；活动底色滑到目标项
- 首页下滚：图不跟着上移、逐渐变模糊，浅色/深色半透明幕布能隐约看到原图；卡片仍可读
- 首页顶部无主题按钮，下滑后按钮出现并把搜索等按钮挤向左

### 7. 审批

- [x] 用户已要求完成 M5 与上述 UI 修改
- [x] 实施完成
- [x] 文档已同步（见交付回复）
