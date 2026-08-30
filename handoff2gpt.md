# M2 完成记录

> 日期：2026-08-29  
> 状态：M2 前台页面已完成；本文件不再是待办清单。下一里程碑为 M3 编辑器与后台管理。

## 已完成

- Heo 风格玻璃前台：主页、文章、分类、标签、归档、瞬间入口与文章详情壳
- StorageDriver：LocalDriver 完整实现，OssDriver 保留明确 stub
- 管理员图片/视频上传：file-type 魔数、扩展白名单、大小限制、SHA-256 去重
- sharp 图片三档：original、480px thumb、最长边 1600px content
- `/api/uploads/[...path]` 流式读取、Range、immutable 缓存、路径穿越防护
- 安全 MDX：blockJS、Video 白名单转 HAST、rehype-sanitize、TOC、双主题 Shiki
- 正文 Video、原生 dialog 图片灯箱、阅读进度
- 密码文章 2 小时 HMAC cookie；未解锁查询不读取 content/excerpt
- Bing zh-CN 每日一图：3 秒超时、最多 2 项缓存、失败回退
- 浏览量：IP+slug 60 秒去重、Prisma 原子自增

## 验收结果

- Windows：`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm lint`、`pnpm build` 通过
- `/posts`：8 张文章卡（7 公开 + 1 密码标题）；密码摘要、draft、scheduled 不出现
- `sanitize-probe`：Video 存活；script/onerror/javascript 不出现
- `locked-garden`：未解锁响应无摘要/正文/`demo-lock`；错误密码 401；正确密码 200，cookie `Max-Age=7200`
- 生产模式已解锁页：`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- 上传冒烟：PNG 成功生成三档；原图别名/Range/immutable 正常；编码穿越请求 400
- Bing 在线请求成功；连续首页请求命中进程缓存
- 浏览量连续两次请求：第一次 `counted=true`，第二次 `counted=false` 且数值不变

## 下一步边界

M3 才接 `main/src/editor/` 的 imageUploadHandler/Video descriptor，并实现后台文章 CRUD、媒体库、设置页与仪表盘。不要在 M3 重写本轮存储、sanitize、解锁或前台 CSS。

公开 `/api/posts`、`/api/posts/[slug]`、`GET /api/settings/public` 仍是可选 REST 预留，不影响 M2 完成。
