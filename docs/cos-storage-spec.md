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

## 5. 备份

加密包与明文包都上传 `backups/`。本地同时受 `backupKeep` 与 `backupLocalMaxMB` 约束。仅 COS 有的包可拉回再恢复。手动删除同时删本地与 COS。COS 访问为 HTTPS 且用户未手设加密开关时默认不加密。

## 6. 设置字段

`cosBucket`、`cosRegion`、`cosSecretId`、`cosSecretKey`、`cosPublicBaseUrl`、`thumbMaxPx`、`thumb2MaxPx`、`backupLocalMaxMB`、`localMediaMaxMB`。SecretId / SecretKey 只写不回显，表单显示「已占用」，重设后再填。`thumb2MaxPx` 只影响本机二级缩略图，不上传 COS。设置页占用数字只在点「扫描本机占用」时扫本机 `data/uploads` 与 `data/backups`，不 List 桶。
