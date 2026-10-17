# Spec：腾讯云 COS 接入备份与媒体库

- 日期：2026-08-30
- 提案人：AI
- 状态：已实施
- 相关红线：存储可插拔、面板优先、备份加密可开关（P-041）、评论/正文仍过 sanitize

## 1. 目标

- 加密备份写完本地后自动上传到 COS `backups/`；明文备份同样上传。本地按总大小滚动删旧包，不删 COS 副本。COS 为 HTTPS 时默认关闭加密。
- 新上传的原图、视频、音频、WebP 缩略图进 COS，并同时写一份本地缓存；超出 `localMediaMaxMB` 只删最早的本地副本。
- 访客 thumb / 封面 / 灯箱小图走 COS HTTPS；点击原图、播放视频/音频走原格式 COS 公网 URL，不经 `/api/uploads` 反代字节。
- 缩略图边长可在设置调整，并提供重新生成。
- 桶名、地域、SecretId、SecretKey、访问域名在 `/admin/settings` 配置。密钥不进仓库、不进公开设置。
- 媒体库「迁移到 COS」补传到新目录树；桶里已有对象则跳过，不重复上传；图片 thumb 也可补传。
- 媒体库默认删除同时清本地（含一/二级 thumb）和 COS；下拉可选只删本地。查看路径只 stat 已知 key，不 List 桶。

产品是**腾讯云 COS**（不是阿里云 OSS）。代码驱动名为 `cos`；读库遇到历史值 `oss` 当 `cos`。

## 2. 对象布局

```
backups/myblog-YYYYMMDD-HHMMSS.tar.gz   私有
images/original/{hh}/{hash}.{ext}       公有读（原格式）
images/thumbs/{hh}/{hash}.webp          公有读
videos/{ext}/{hh}/{hash}.{ext}          公有读
audio/{ext}/{hh}/{hash}.{ext}           公有读
```

本地与 COS 同一套 POSIX key。旧 `media/` 与 `images/{hash}-*` 仍可读。详见 [media-layout-spec.md](media-layout-spec.md)。

## 3. 驱动与 API

`CosDriver`（`lib/storage/cos.ts`）用官方 `cos-nodejs-sdk-v5`：

- PUT Object / `putObject`：新媒体
- 分块 `uploadFile`：加密备份
- GET / HEAD / DELETE Object
- GET Bucket（`Prefix: backups/`）

凭证从 Setting 读取。未配齐则新媒体上传 `503 COS_NOT_CONFIGURED`；备份仍可只留本地。

## 4. 上传与展示

- 图片：sharp 出 WebP thumb，原图保持原格式；本地 + COS 双写
- 视频/音频：原文件双写；`kind` 为 `image | video | audio`
- 音频白名单：mp3 / m4a / aac / ogg / opus / wav / weba
- 文章插入 `<Audio src>`，消毒对齐 Video；瞬间本轮仍只收图
- 访客 thumb 与灯箱原图、`<video>`/`<audio>` 使用 COS URL；旧 `/api/uploads` 只服务本地缓存
- **灯箱原图优先直连 COS**（`lib/client/lightbox-src.ts`：`lightboxOriginalUrl()`）：配了 COS 就用 `data-lightbox-src`（对象存储直链），只有站内 `/api/uploads/...` 路径才走 `?proxy=1` 同源流式；直连失败（最常见：桶上没配 CORS）自动退回代理，再失败就让 `<img>` 直接加载。2026-10-01 实测（同一张 4.82 MB 原图，同一台客户端）：**站点中转 1.03 MB/s（4.90s） vs COS 直连 8.10 MB/s（0.62s）**——原图动辄 3–5 MB，走服务器等于把轻量机的出网带宽当瓶颈。见 [P-119](pitfalls.md)
- **进度环需要桶上配 CORS**：跨域 XHR 要读 `Content-Length` 才能算百分比，所以 COS 桶的跨域访问规则必须 `Origin: https://<站点域名>`、`Methods: GET, HEAD`、**`Expose-Headers: Content-Length`**。没配也不会白屏——代码会退回 `?proxy=1`（图照出，只是慢回站点带宽），最坏走 `<img>` 直载（无进度环）
- **上云的进度条要自己数**（2026-10-06，见 [P-170](pitfalls.md)）：`finalize` 的 `replicate` 一步是**服务端**在传，浏览器只能靠轮询服务端登记表（`GET /api/admin/uploads/finalize/progress?hash=…`）画进度。而"服务端传到哪了"不能用 SDK 的 `onProgress` —— 实测它对 Buffer body 只回调 0/100 两次。所以 **需要进度时把 body 换成自计数流**（`lib/storage/progress-stream.ts`）：流按 socket 回压一段段被 SDK 读走（同一实验 4 MB 被读走 64 次），"已读字节"就是真实进度。两个代价：**SDK 对"流" body 不做自动重试**（所以 `CosDriver.put` 自己重试 ≤3 次、每次重建流），**流必须自带 `ContentLength`**。备份包、缩略图、双写这些不需要进度的上传继续用 Buffer，保留 SDK 自带的重试。

## 5. 备份

加密包与明文包都上传 `backups/`。本地同时受 `backupKeep` 与 `backupLocalMaxMB` 约束。仅 COS 有的包可拉回再恢复。手动删除同时删本地与 COS。COS 访问为 HTTPS 且用户未手设加密开关时默认不加密。周期备份的「每几天 + 几点几分」也在**备份页**设（`backupPeriodDays` / `backupAtTime`，默认 3 天 03:00，服务器本地时间），开启加密时它不自动执行。

### 5a. 上云是**后台上传**，不挂在请求上（2026-10-03）

- **一次请求绝不等上传**：`POST /api/admin/backup/run` 只把包落到本地并把任务排进队列（`lib/backup/uploads.ts`）就返回；导入备份包（`backup/restore/upload`）同理。一个 60–80MB 的包要传几十秒，挂在请求上就会被进程重启 / 网关超时腰斩，用户只看到一句莫名其妙的报错，本地有包、云端没有。
- **状态先落盘再上传**：`data/backup-uploads.json` 记 `queued` / `uploading` / `failed` + 次数 + 原因。进程被打断后由 60 秒调度 tick 与启动补偿接着传，指数退避（30s→10min 封顶），连续 5 次失败就停手，只剩管理员手动重试。
- **失败了要看得见、能补救**：备份页「位置」列写 `本地` / `本地 · 上传中…` / `本地 · 上云失败` / `本地 + COS` / `仅 COS`；只在本机的包多一个「上传到 COS」按钮（失败时文案是「重试上传」，`POST /api/admin/backup/push`）。上传期间列表每 4 秒自取一次，传完自动变成「本地 + COS」。
- **本地副本先别删**：轮转清理（`backupKeep` / `backupLocalMaxMB`）会放过还在队列里（`queued` / `uploading`）的包——那是它上云前的唯一一份；`failed` 的不挡住清理（否则磁盘会被撑满），但记录会留着让用户看见并重试。
- **没配 COS 就跳过**：纯本地站点一切照旧（P-145），队列记录会被清掉，不留永远传不完的幽灵。

## 6. 设置字段

`cosBucket`、`cosRegion`、`cosSecretId`、`cosSecretKey`、`cosPublicBaseUrl`、`thumbMaxPx`、`thumb2MaxPx`、`backupPeriodDays`、`backupAtTime`、`backupKeep`、`backupLocalMaxMB`、`localMediaMaxMB`。SecretId / SecretKey 只写不回显，表单显示「已占用」，重设后再填。`thumb2MaxPx` 只影响本机二级缩略图，不上传 COS。占用数字只在点「扫描本机占用」时扫本机 `data/uploads` 与 `data/backups`（设置页扫媒体库、备份页扫备份包），不 List 桶。
