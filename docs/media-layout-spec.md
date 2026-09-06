# Spec：本地媒体限额、目录对齐、缩略图与文章 URL

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：存储可插拔、面板优先、备份加密可开关（P-041）、1GB 内存

## 1. 目标

- 本地可缓存媒体，体积上限在后台设置；超出只删最早的本地副本，不删 COS、不删库。
- 本地与 COS 同一套 POSIX 目录（类型 + 扩展 + hash 前 2 位分片）。
- 缩略图 WebP；原图保持上传时的原格式。超过 10MB 的图片在确认后压缩到 10MB 以下，压缩结果即为原图。
- 写文章/瞬间时先把原图写入本地；点发布后才生成缩略图并上传 COS。媒体库上传会立刻做完这两步。
- 访客 thumb / 封面走 COS。点开原图：缩略图模糊底 + 加载进度，原图就绪后约 1s 变清晰且框尺寸不变。舞台按原图像素排版再 scale 进视口，避免把原图画进缩略图大小的盒子。同一页再点同一张走 blob 缓存，不重新下载。滚轮 / 触屏双指可放大，放大后可拖。
- 重生成缩略图按 `Upload` 元数据定位文件：先本地，再 COS。
- 文章地址 `/posts/{8 位 base62}/{链接名}`，无链接名用 `article`；旧 `/posts/{slug}` 301。

## 2. 目录

```
images/original/{hh}/{hash}.{ext}
images/thumbs/{hh}/{hash}.webp
images/thumbs2/{hh}/{hash}.webp   # 仅本地，不上 COS；首页瞬间瀑布
videos/mp4/{hh}/{hash}.mp4
videos/webm/{hh}/{hash}.webm
audio/mp3|m4a|aac|ogg|opus|wav|weba/{hh}/{hash}.{ext}
backups/   # 仅 COS，私有
```

`{hh}` = SHA-256 hex 前 2 位。旧 `media/` 与 `images/{hash}-*` 仍可读。

## 3. 本地限额

Setting `localMediaMaxMB`（默认 512，64–10240）。COS 未配齐时不删本地原文件。后台「设置」点「扫描本机占用」后展示本机合计与分项（原图/音视频、一级缩略图、二级缩略图）以及各本地备份包体积。打开设置页不扫盘。只扫本地 `data/uploads` 与 `data/backups`，不 List COS。

## 4. 媒体库

- 列表按 `Upload.createdAt` 倒序。可在库内上传图片/视频/音频（与 `/api/upload` 同一套入库；库内上传会立刻生成缩略图并上 COS）。音频展示音符图标和时长（`variants.duration`，浏览器读 metadata）。
- 任意后台上传都会在页面顶部弹出多文件传输进度条（可灰叉收起，顶部留一条可点回来）。
- 「查看」列出该文件全部本地/COS 路径、可点 URL 和体积。
- 「删除」下拉：默认同时删本地原图、一级 thumb、二级 thumb 和 COS；可选仅删本地、保留 COS 与库记录。若文章或瞬间仍引用，弹出警告后仍可删（不再 409）。
- 写文章插入图片/视频/音频时可从媒体库导入。

## 5. 文章 URL

`Post.publicId` 8 位 base62，唯一。规范路径 `postHref()`。解锁 cookie 绑 `publicId`。

## 6. 备份

`blog.db` 含文章与设置、Upload key。包内 `uploads/` 只含当时本地缓存。COS 对象靠同一桶。
