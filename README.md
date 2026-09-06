# MyBlog — 个人博客系统

基于 Next.js 16 的个人博客：前台（主页/瞬间/文章/全局搜索/留言板）+ 后台（文章管理、mdx-editor 富文本发布、评论审核、自动备份、程序更新）。设计风格参考 theme-hao（Heo 风格圆角卡片 + 丝滑动效）。

> 站长高级用法与注意事项见 **[docs/user-manual.md](docs/user-manual.md)**（备份加密、程序更新、COS、自定义模块等）。AI 协作请先读 [AGENTS.md](AGENTS.md)；文档索引见 [docs/README.md](docs/README.md)。进度见 [PLAN.md](PLAN.md)。

## 特性

- **前台**：主页（可在后台自由排布的模块化格点：Banner + 欢迎 + 瞬间 + 文章卡 + 侧栏 widget；推荐文章默认关闭）、文章列表/分类/标签/归档、瞬间（瀑布流/朋友圈宫格/点赞）、留言板、⌘K 搜索（密码文仅标题）。Banner 底图完全加载后再播出场动画；加载超过 2 秒才用与后台上传相同的顶栏进度条，满格后自动关掉；文章卡悬停只扫一道光泽，移开不回放
- **首页模块化**：后台「首页管理」可强制模拟电脑/手机画框，两套模块大小独立配置（其它文案配置共用）。模块盒子先定尺寸，内部按容器重排；宽屏两侧留白。拖动时蓝框标出落点；可改宽、改高、重置当前视口大小。可统一调模块玻璃底和首页背景的不透明度。「欢迎光临」里漂浮色块的文字可在首页管理里按行填写。「模块管理」可新建自己的模块，往里放现成积木或直接写 HTML / CSS / JS。首页底部可显示站点运行时间（精确到秒），开始时间在「设置」里填，空着则不显示
- **文章能力**：安全 MDX、目录（h1–h6 分层，点击平滑滚动到对应标题；阅读页侧栏默认只显示目录，点右侧按钮展开其它卡片）、双主题代码高亮、Video、图片灯箱（滚轮/双指放大，同一页再开走缓存）、阅读进度、浏览量 60 秒去重，2 小时签名 cookie 的密码文章；详情顶 Banner 可选封面/纯色/混色；后台可导入 Markdown
- **评论**：游客昵称两级嵌套、提交后待审；管理员回复直接显示；XSS 按纯文本转义。文章、瞬间、留言板的评论栏都默认收起，点标题才展开
- **瞬间**：单张按原比例完整显示，多张方图；点一次展开挤开，再点看原图。首页有瞬间模块（打字机文案 + 本地二级缩略图瀑布）
- **上传存储**：管理员 CSRF 上传；file-type 魔数校验；原图保持原格式，超过 10MB 的图片会先提示再压缩到 10MB 以下作为原图；写文章时先存本地，点发布后才生成一级缩略图并上传 COS。一级缩略图 WebP 本地与 COS 双写；二级缩略图（默认长边 320px）只留本机。本地缓存有上限（默认 512MB）；访客封面/一级缩略图与原图直链 COS。点开原图会先显示模糊缩略图和加载进度，完成后再变清晰；同一页再点同一张直接用缓存。灯箱内可用滚轮或双指放大，放大后可拖动
- **文章地址**：`/posts/{8 位公开 ID}/{链接名}`，没有链接名时最后一段是 `article`；旧 `/posts/{slug}` 会跳到新地址
- **后台**：`/admin` 登录后可写文章（mdx-editor 可视化编辑 / 预览 / 导入 md；左侧设置卡片收起后只留标题；分类与标签可在写文章时当场新建并选用）、排首页布局、建自定义模块、管理瞬间/评论/媒体库（库内上传带顶部进度条、按时间倒序、查看本地/COS 路径与体积、删除可保留 COS）/备份/程序更新/站点设置（含腾讯云 COS；设置页可点「扫描本机占用」查看媒体库/一级缩略图/二级缩略图与各备份包体积）；列表页顶栏显示当前页标题；删除、恢复、立刻重启等危险操作用红字加粗提示；写文章页左侧栏目与设置可从各栏右上角图标收起，右侧为顶部工具栏 + 正文；鼠标在某一栏滚动时其它栏不动；标题按字号显示；点「图片 / 视频 / 音频」弹出插入框（上传、从媒体库导入或外链），按住顶部「拖动」换位；外链视频下方标域名；文章可勾选「首页推荐」；保存并发布会等图片压缩、生成缩略图和上云全部完成；瞬间多张为方图并可拖动排序，单张按原比例显示
- **安全**：SQL 注入/XSS/CSRF/暴力破解/点击劫持/上传攻击/路径穿越防护；未改初始密码不能调管理 API；密码文评论未解锁不外泄
- **SEO**：sitemap / robots / RSS（密码文不进 RSS）；后台「设置」可填站点地址
- **备份**：自动周期备份数据库+本地上传；加密可关可开；包可上 COS；拆分密钥，只拿走文件解不开
- **轻量**：1GB RAM 可运行；SQLite 单文件数据库

## 技术栈

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 · Prisma 6 + SQLite · mdx-editor v4.2.3 (vendor) · iron-session · sharp

## 目录结构

```
myblog/
├── main/        # 应用代码（Next.js 项目根）
├── docs/        # 文档（含 docs/ai/ 机器维护文档）
├── reference/   # 只读参考资料（rules.md、theme-hao）
├── AGENTS.md    # AI 协作总纲
└── PLAN.md      # 实施计划与进度
```

## 环境要求

- Node.js ≥ 22（开发基线 Node 24），pnpm ≥ 9
- **开发调试在 Windows**（Win11）；生产部署 Linux（pm2 fork 单实例）
- 内存：1GB RAM 可运行（资源红线，见 docs/architecture.md）

## 快速开始（开发）

```powershell
cd main
pnpm install
Copy-Item .env.example .env
pnpm prisma migrate dev
pnpm dev
```

浏览器打开 http://localhost:3000 ，未创建过管理员时会进入 **创建站点**（站点名称、管理员、备份口令）。无界面时在 `main/` 下执行 `pnpm setup`，问同一套。没有代码内默认账号，也没有默认站名 MyBlog。

生产不要跑 `pnpm db:seed`。开发若要演示文章：`pnpm db:seed`。`pnpm test` / `pnpm dev` / `pnpm start` / pm2 都走 `scripts/boot.cjs`。

后台入口 `/admin`。高级注意见 [docs/user-manual.md](docs/user-manual.md)。

## 构建与部署

不要把 Windows 上的 `node_modules`、`.next` 或整仓几 GB 传到服务器。发布物就是程序更新包。空机步骤见 [`main/INSTALL.md`](main/INSTALL.md)。

```powershell
cd main
pnpm pack:update
# 或按标签：pnpm pack:update --git v0.1.0
```

Linux 空机：解压 tar.gz → `bash scripts/install.sh` → 创建站点 → `pm2 start ecosystem.config.cjs`。以后只换包：后台「更新」导入，或 `pnpm apply-update --file ./包.tar.gz && pm2 restart myblog`。

生产用 **pm2 fork 单实例**。nginx 必须覆盖 `X-Real-IP`，`client_max_body_size 512m`。1GB 内存请先加 swap。细节见用户手册「部署」。

## 数据目录（不要提交）

| 位置 | 说明 |
|---|---|
| `main/.env` | SESSION_SECRET、DATABASE_URL；gitignore |
| `main/data/` | 库、上传、备份、更新包、主机半钥；gitignore |

（章节清单对照 docs/readme-requirements.md 维护）
