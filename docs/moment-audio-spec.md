# Spec：瞬间发语音（网页置顶录音卡片 + App 原生录音界面 + 媒体库音频分区）

- 日期：2026-10-11
- 提案人：AI
- 状态：**已批准 / 已实施**（用户本轮问答拍板：不强制 MP3、App 走原生自绘、可混发分区展示、先落 Spec 再实现；实现与验证见 §9）
- 关联：[moments-home-spec.md](moments-home-spec.md)、[moment-video-spec.md](moment-video-spec.md)、[moment-visibility-spec.md](moment-visibility-spec.md)、[media-layout-spec.md](media-layout-spec.md)、[api-contracts.md](api-contracts.md)、[android/architecture.md](android/architecture.md)

## 1. 目标

给「发瞬间」加**语音**这种媒体，网页端与 Android 端两套交互：

1. **网页端**：点发布区的麦克风图标 → 弹出**置顶（fixed）长条小卡片**：左边是实时音量波形（简化条状、**从左往右长、满窗口后整条向左滚**），中间是录制时间，最右是停止按钮；**按下停止即自动上传**，发布前可以试听、可以删除。
2. **Android App**：同一个图标**不弹网页卡片**，改成宿主自己的**独立录音界面**（苹果式弹入动画的小窗）：实时波形 + 计时 + 停止；**停止后不直接上传**，而是显示整段音频的波形，可以拖两端**截取/裁剪时长**、可以**预览**，确认后才回传给页面走上传。
3. **规则**：一条瞬间最多 **5 条**语音，单条时长上限 **5 分钟**；语音与图片/视频**可以混发**，但**展示上分区**（图片/视频走九宫格，语音走独立播放行）。
4. **存储**：语音进**媒体库**，和别的媒体一样（本地 + COS、删除、限额都走同一条链路），但媒体库要**按类型分开**：图片 / 视频 / 音频各有自己的筛选。

用户已拍板的口径（本轮问答）：

- **不强制 MP3**：用浏览器/系统**原生编码**（网页 MediaRecorder 的 WebM/Opus、App 的 MP4/AAC 128 kbps），不引入任何新依赖、服务端不装 ffmpeg。代价见 §7。
- **App 录音界面用原生 Kotlin 自绘**（不是网页层浮窗）：动画、波形、裁剪都在宿主里做。
- 语音与图片/视频可混发；「分开放」落在**媒体库分类筛选 + 瞬间内分区展示**。

## 2. 设计方案

### 2.0 现状（改造前，已核对）

| 事实 | 证据 |
|---|---|
| 上传链路**已支持音频**，不用新接口 | `lib/upload/handle.ts` 的 `AUDIO_TYPES`（含 `audio/mpeg`/`audio/mp4`/`audio/webm`）、`kindOfMime()`、`duration`、`audio/` 分片目录 |
| 客户端上传已有音频分支 | `lib/client/upload.ts`：`kind === "audio"` 时先本地探测时长再上传 |
| 瞬间媒体是 JSON，加一种媒体类型不用迁移 | `Moment.images`；`lib/moments/types.ts` 的 `momentMediaKind()` |
| 媒体库列表接口已支持按类型过滤，UI 没暴露 | `lib/uploads/admin.ts` 的 `listAdminUploads(page, size, kind, album)`；`app/admin/(protected)/uploads/page.tsx` 只传了相册 |
| **全站麦克风是封死的** | `lib/proxy.ts`：`Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| App 侧录音现在必然失败 | `AndroidManifest.xml` 无 `RECORD_AUDIO`；`MainActivity` 只实现了 file/choice/dateTime 三类 prompt |

### 2.1 数据模型：`Moment.images` JSON 加 `kind: "audio"`（不迁移、不加列）

```ts
type MomentMedia = {            // 现名 MomentImage，沿用原名减少无谓改名
  key: string;                  // 音频的媒体 key（与图片/视频同一套）
  thumb?: string;               // 只有图片有
  width?: number; height?: number;
  kind?: "image" | "video" | "audio";   // 缺省 = image（旧数据零改动）
  mime?: string;                // 音频真实 mime（audio/webm、audio/mp4…）
  duration?: number;            // 秒
  peaks?: number[];             // 波形峰值（0–100，最多 48 个）——尽力而为，可缺
};
```

- 判定仍是**唯一入口** `momentMediaKind()`（缺 `kind` = 图片），新增 `"audio"` 分支。
- `peaks` 是**尽力而为**：网页录音时从 AnalyserNode 实时采集（真实波形）；App 录音与媒体库选取拿不到时**不写**，渲染端用「按媒体 key 确定性生成的图案」兜底（§2.6）。
- 公开投影（`lib/moments/query.ts`）：音频 `src` 走同一套 `resolvePublicImageUrl(key)`，**没有 `thumbSrc`/`thumb2Src`**（不查缩略图）。

### 2.2 规则：唯一判定点 `lib/moments/compose-rules.ts`

```
MOMENT_MAX_AUDIOS      = 5
MOMENT_MAX_AUDIO_MS    = 5 * 60 * 1000      // 单条上限，不是合计
MOMENT_AUDIO_LIMIT_ERROR     = "一条瞬间最多 5 条语音"
MOMENT_AUDIO_TOO_LONG_ERROR  = "语音不能超过 5 分钟"
countMomentAudios(media)     // 语音条数
splitMomentMedia(media)      // → { visual, audios }：展示分区与计数共用同一处
```

- 这三条同时被四处使用：发布区前端预检、`POST` 的 zod（`momentWriteSchema`）、`PATCH` 合并后判定（`updateAdminMoment`）、Android 侧常量（与 `CompressPolicy.MAX_DURATION_MS` 同一套「产品常量 + 引用文档」做法）。
- 语音**不占**图片/视频那 9 个名额：`images` 数组的 zod 上限从 9 提到 14（9 非音频 + 5 音频）；「非音频 ≤ 9」维持现状不动（这条上限今天就是硬编码 9，与后台 `uploadMaxImagesPerBatch` 的既有不一致见 §7）。

### 2.3 关键坑：**纯音频的 WebM/MP4 会被 `file-type` 判成 video**

`handleUpload()` 用 `file-type` 嗅探真实类型，再用 `validateDetectedType()` 与前端声明的 `kind` 对齐。实测结论（读 `file-type@22.0.2` 源码）：

- `source/index.js`：MP4 只按 `ftyp` **主品牌**判 —— `M4A ` → `audio/x-m4a`，其余（Android MediaRecorder 写的是 `isom`/`mp42`）→ **`video/mp4`**。
- `source/detectors/ebml.js`：WebM 按 EBML DocType 判 —— 音频-only 的 WebM 照样是 **`video/webm`**。

也就是说：**浏览器录的 WebM/Opus、App 录的 M4A 全都会被判成 video → `MEDIA_KIND_MISMATCH` 400**，功能直接死在上传这一步。

修法（窄口子、失败关闭）：

- 新增 `lib/upload/audio-container.ts`，两个**有界**解析器：
  - `isAudioOnlyMp4(buffer)`：走顶层 box（`ftyp`/`moov`/`mdat`…）找 `moov`，再看每个 `trak > mdia > hdlr` 的 handler_type：有 `soun` 且**没有** `vide` → 纯音频；
  - `isAudioOnlyWebm(buffer)`：走 EBML（varint ID/size）找 `Segment > Tracks > TrackEntry > TrackType`：有音频轨（2）且**没有**视频轨（1）→ 纯音频。
- 只在 `requestedKind === "audio"` 且 `file-type` 给出 `video/mp4` / `video/webm` 时启用；**解析失败/截断/畸形一律按原逻辑拒绝**（fail closed，不给"把视频伪装成音频"开后门）。
- 命中后按 `audio/mp4`（ext `m4a`）/ `audio/webm`（ext `weba`）归类，两个 mime 本就在 `AUDIO_TYPES` 白名单里。
- 有界性：只读内存里的 Buffer（上传本身有大小上限）、不做递归展开、不分配与文件等长的额外缓冲。

> 这条不只修本次功能：**Safari 的 MediaRecorder 也产 `audio/mp4`**，媒体库当年从没验过音频-only 容器这条路。

### 2.4 网页端：置顶录音卡片

- 入口：`components/admin/MomentVoiceButton.tsx`（麦克风图标，与 `MomentImageButton` 同一行的图标按钮），带已录条数徽标；满 5 条禁用。
- 卡片：`components/admin/VoiceRecorderPanel.tsx`，`position: fixed; top: 12px; 居中对齐`（置顶、不随页面滚动），长条三段：
  1. **左**：实时波形 —— `AudioContext + AnalyserNode`，每 100ms 算一次 RMS，归一化成 0–100 存进环形缓冲（窗口 = 最近 10 秒 = 100 根）。**方向（用户口径，别自己改）**：槽位宽度固定、**从最左边开始向右长**；满了 10 秒后每来一根整条**向左滚动**一格，最旧的从**左边**滑出，最新的一根始终在最右，屏幕上永远是过去 10 秒；算式 `liveSampleIndexFor()` 有单测钉住（P-190）；
  2. **中**：`mm:ss` 计时 + 上限倒计时（剩 30 秒变色）；
  3. **右**：停止按钮（方块图标）——按下即停、**自动上传**（走 `uploadAdminFile({ kind: "audio" })` + 现有传输 HUD），上传完成的条目出现在发布区的语音列表里。
- 上限：录音到 **5:00 自动停并上传**；超过 5 条直接不出按钮。
- 失败路径：麦克风被拒/无设备 → 卡片内一句人话（不静默）；上传失败 → 沿用现有错误提示，条目不入列表。
- **发布前可试听、可删除**：`components/admin/MomentAudioList.tsx`（▶/⏸ + 时长 + 删除；本机用 blob 预览地址，不回头拉服务端）。
- 编码：`new MediaRecorder(stream, { audioBitsPerSecond: 128_000 })`，mimeType 按 `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → 浏览器默认**逐个降级探测**；实际 mime 写进媒体项的 `mime`。
- **权限头**：`Permissions-Policy` 属于顶层文档，后台内软导航不会重取响应头，因此整个 `/admin` 路径树放开 `microphone=(self)`；前台与 API 保持 `()`，camera/geolocation 全站关闭。前台进入后台必须文档级跳转（Footer、Navbar 外观），否则会继承公共页面的 `microphone=()`。路径判定收口在 `lib/security/permissions-policy.ts`，配单测；不要在 `proxy.ts` 里手写第二份列表（P-191）。

### 2.5 Android 端：原生录音界面（走既有的文件 prompt 契约）

站点与宿主之间**只加一个 accept 标记**（沿用 `MediaKinds.kt` 那套「accept 就是契约」的既有做法）：

| 层 | 内容 |
|---|---|
| 站点常量 | `lib/upload/limits.ts` 新增 `VOICE_RECORD_MIME = "audio/x-smartblog-voice"` |
| 站点 App 模式 | 服务端 UA 判定（复用 `isSmartBlogApp()`）下传 `appMode`；App 模式下麦克风按钮点开的是一个 `accept` 带该标记的隐藏 `<input type="file">`，**不启动 getUserMedia、不弹网页卡片** |
| 宿主判定 | `MediaKinds.kt` 新增纯函数 `isVoiceRecordRequest(types, capture: Int)`（JVM 单测）：认 accept 里的标记 MIME，**或** `capture != 0` 且 accept 全是音频；`MainActivity.onFilePrompt` 命中即走录音器，**不再**走相册/系统选择器 |
| 回传 | 录音器产出的文件走既有 `confirmPending(uris)` → `prompt.confirm(files)`，页面 `<input type="file">` 拿到 File 后**复用现有上传链路**（零新增 API、零 cookie 传递问题） |

> ⚠️ **实测（2026-10-11 模拟器）**：GeckoView 会把**认不出的自造 MIME 从 `mimeTypes` 里过滤掉** —— 日志里到宿主手里的是 `audio/webm, audio/mp4, audio/ogg capture=2`，标记 `audio/x-smartblog-voice` 已经没了。
> 所以第二条判据（`capture != 0` + 全音频）**不是锦上添花，是主路径**；只认标记 MIME 会在真机上直接失效。
> 另注：`FilePrompt.capture` 是 `int` 字段（javap 实读 AAR，P-187）。

宿主侧实现：

- `AndroidManifest.xml` 加 `RECORD_AUDIO`；录音器打开时运行时申请，拒绝 → 关窗 + 提示（绝不让页面一直等）。
- `VoiceRecorderView.kt`：独立录音界面（**不放进相册视图**），自绘：
  - 弹入动画：整卡 `translationY + alpha + scale`（~280ms，`DecelerateInterpolator`），波形条 stagger 入场；退出反向；返回键逐层退；
  - 录制中：实时波形（`MediaRecorder.getMaxAmplitude()` 每 `SAMPLE_MS = 100ms` 采样）、计时、停止按钮、上限提示；波形口径与网页**同一套**（固定 10 秒 / 100 槽位、**从左往右长、满了整条向左滚**，算式 `VoiceRecorderPolicy.liveSlot()` + 单测，P-190）；
  - 停止后：**整段波形**（下采样到 ~120 根，按时间左→右铺满整条）+ 左右两个拖动手柄截取区间 + **试听**（`MediaPlayer` 播所选区间，到点自动停并回到起点）+ **点波形任意位置从那儿试听** + 拖动中正在试听就按新起点重新定位 + 顶部「已选 / 总长」与两端 `起 … / 止 …` 时刻 + 「重录 / 试听 / 使用」；
  - ⚠️ 按钮**必须在 `wireActions()` 里接线**（漏过一次 → 真机"点了没反应"，P-189）；动作行一律 `MATCH_PARENT`（`width=0 + weight=1` 塞进 `WRAP_CONTENT` 行会量成 0 宽、看不见也点不到）；
  - 生命周期：`onPause` 停止录音并取消（不申请前台服务，保持本项目「不要 FOREGROUND_SERVICE」的既定立场）；`onDestroy` 兜底释放；产物目录在每次打开前清（与 `PhotoFiles.clearEditedDir()` / `VideoCompressor.clearCache()` 同一时机）。
- `AudioRecorder.kt`：`MediaRecorder`（`MIC` + `MPEG_4` + `AAC`，**128 kbps / 44.1 kHz / 单声道**）→ 落 `cacheDir`；上限 = `min(300 秒, uploadMaxBytes ÷ 16 KB/s)`（复用已有的 `uploadMaxBytes`，站点上限调小也录得进去）。**取消/退出必须无条件走 `stop → reset → release`**：不能用“文件对象是否存在”当释放麦克风的前置条件；`VoiceRecorderView.shutdown()` 也只能调这个统一出口，否则界面关了、系统麦克风仍在占用（2026-10-17 修复）。
- `AudioTrimmer.kt`：裁剪用 **`MediaExtractor` + `MediaMuxer`**（无 ffmpeg、无新依赖，采样级复制不重编码）：`seekTo(startUs, SEEK_TO_PREVIOUS_SYNC)` 起读，写到 `endUs` 为止；未改动区间时**直接交原文件**（不重封装）。
- `VoiceRecorderPolicy.kt`：纯逻辑（JVM 单测）—— 波形条归一化、上限时长换算、裁剪区间算术（手柄位置 ↔ 毫秒、最小时长、贴边夹取）、时钟文案。

### 2.6 前台渲染与媒体库分区

- `components/moment/MomentAudioRow.tsx`：一条语音 = ▶/⏸ + 条状波形 + 时长 + 播不动时的降级提示（`<audio>` 报错就给「浏览器不支持，点这里下载」）。波形优先用 `peaks`；没有则用 `pseudoPeaks(key)`（按媒体 key 确定性生成，**同一段音频每次渲染一样**）。
- `MomentGrid` / `MomentList` / 首页瞬间卡：媒体先过 `splitMomentMedia()` —— 图片/视频走原来的九宫格与视频瓦片，语音在下方**独立成区**渲染（不占九宫格、不进灯箱）。
- 语音-only 的瞬间：正文允许为空（今天已允许只发媒体），通知文案补一句「分享了一段语音」（`lib/feed/updates.ts`）。
- 媒体库：`app/admin/(protected)/uploads/page.tsx` 加 `?kind=` 读取 + `components/admin/UploadsKindFilter.tsx`（全部 / 图片 / 视频 / 音频，保留 `album` 参数一起筛），`UploadCard` 对音频渲染可播行而不是图片瓦片（列表接口本来就支持 `?kind=`）。

## 3. 影响面分析

- **涉及模块**：站点侧 `lib/moments/{types,compose-rules,query,admin,media?}`、`lib/upload/{limits,handle}`、新增 `lib/upload/audio-container.ts`、`lib/client/voice-recorder.ts`、`lib/proxy.ts`、`components/admin/{MomentCompose,MomentVoiceButton,VoiceRecorderPanel,MomentAudioList,UploadsKindFilter,UploadCard}`、`components/moment/{MomentGrid,MomentList,MomentAudioRow}`、`components/home/modules/MomentCard`、`lib/feed/updates.ts`、`app/{globals,admin/admin}.css`；Android 侧 `MediaKinds.kt`、`MainActivity.kt`、新增 `VoiceRecorderView.kt`/`AudioRecorder.kt`/`AudioTrimmer.kt`/`VoiceRecorderPolicy.kt`、`AndroidManifest.xml`。
- **新增/变更配置字段**：无新 Setting。上限（5 条 / 5 分钟）是**产品常量**，不进后台面板；单文件体积上限继续吃既有的 `uploadMaxSizeMB`。
- **是否破坏红线**：不破坏。文件读写仍只经 `lib/storage`；无原生 SQL；**无 Prisma schema 变更**（无迁移，`lib/data-clear/coverage.ts` 不动）；vendor 冻结子树不动。
- **新增依赖**：**零**。前端不引 MP3 编码器（用原生编码），App 不加 ffmpeg/音频库（裁剪用系统 `MediaExtractor`/`MediaMuxer`）。仍满足 1GB RAM / 单实例约束。
- **权限口径变化**：`Permissions-Policy` 对后台 `/admin` 路径树放开 `microphone=(self)`，公共页面继续关闭；App 新增 `RECORD_AUDIO`（运行时申请，拒绝即降级）。

## 4. 输入输出边界

- `POST /api/admin/moments` / `PATCH /api/admin/moments/{id}`：`images[]` 每项可带 `kind: "audio"`、`mime`、`duration`、`peaks`；服务端执行「语音 ≤ 5 条」「单条 ≤ 5 分钟」「文字或媒体至少一个」「视频 ≤ 1」。
- `POST /api/upload`：**契约不变**（仍 `file` + `kind` + `duration`）；行为变化只有一处 —— 声明 `kind=audio` 时，纯音频的 MP4/WebM 容器不再被误判成 video。错误码沿用 `UNSUPPORTED_MEDIA_TYPE` / `MEDIA_KIND_MISMATCH` / `FILE_EXTENSION_MISMATCH`。
- `<input type="file" accept="audio/x-smartblog-voice">`：**站点 ↔ 宿主的新契约**（与 `image/*`、`video/*`、`MEDIA_ACCEPT` 同一层含义）。
- `GET /api/upload/limits`：**响应体不动**（App 复用已有的 `maxBytes`）。
- `GET /api/admin/uploads?kind=audio`：已有能力，本次只是把 UI 接上（`?kind=` 支持逗号分隔多值）。
- 数据模型：无 Prisma 变更；`Moment.images` JSON 向后兼容（旧行缺 `kind` = 图片，缺 `peaks` = 用图案兜底）。

## 5. 实施步骤

1. 站点数据层：`types.ts`（audio kind + peaks）、`compose-rules.ts`（5 条 / 5 分钟 / `splitMomentMedia`）、`peaks.ts`（归一化 + 确定性图案）、`validation/post.ts`（schema + 数组上限）。
2. 站点上传层：`audio-container.ts`（MP4/WebM 纯音频判定）+ `handle.ts` 接线 + `limits.ts` 的 `VOICE_RECORD_MIME`。
3. 站点发布区：`MomentVoiceButton`、`VoiceRecorderPanel`、`MomentAudioList`、`MomentCompose` 接线（上传、计数、提交、失败路径）。
4. 站点前台与媒体库：`MomentAudioRow`、`MomentGrid`/`MomentList`/首页卡片分区、`UploadsKindFilter` + `UploadCard` 音频行。
5. 站点权限：`proxy.ts` 对 `/admin` 路径树放开 `microphone=(self)`，前台仍关闭。
6. Android：Manifest 权限 + `MediaKinds.isVoiceRecordAccept` + `onFilePrompt` 分支 + 运行时授权。
7. Android：`VoiceRecorderPolicy`（纯逻辑）→ `AudioRecorder` → `AudioTrimmer` → `VoiceRecorderView`（动画/波形/裁剪/预览）+ 生命周期与目录清理。
8. 测试：站点单测（规则 / peaks / 容器判定 / 通知文案）+ JVM 单测（accept 判定 / 录音策略 / 裁剪算术），**并登记进 `package.json` 的测试清单**（P-141）。
9. 验证：`npx tsc --noEmit`、`pnpm test`、`node scripts/check-admin-classes.mjs`、真浏览器（假麦克风）端到端「录制→上传→发布→播放」、`pnpm shot` 出图；Android `gradlew :app:testDebugUnitTest` + `:app:assembleDebug`。
10. 文档同步（module.md / architecture.md / api-contracts.md / android/architecture.md / pitfalls / README / moments-home-spec / media-layout-spec）+ changelog + `delivery_check`。

## 6. 验收标准

1. 网页端（桌面浏览器，真实麦克风或 `--use-fake-device-for-media-stream`）：点麦克风 → 置顶长条卡片出现，波形随音量走动、计时递增；点停止 → **自动上传**，条目出现在语音列表，可试听、可删除。
2. 录满 5 分钟自动停止并上传；第 6 条语音的入口禁用；服务端对 >5 条 / >5 分钟的请求返回对应文案（不是 500）。
3. 发布后 `/moments` 上语音渲染成独立播放行（与图片/视频分区），能播、能显示时长；首页瞬间卡同样能看出「有一段语音」。
4. 媒体库：`?kind=audio` 只列音频，`?kind=image` / `?kind=video` 各归各位；音频卡片可以直接播。
5. **纯音频 WebM/MP4 能作为 `kind=audio` 上传成功**（改造前必然 400）：单测覆盖 MP4/WebM 纯音频、含视频轨、截断畸形三种输入；真浏览器录出的 WebM 走一次真实 `POST /api/upload`。
6. App 内点麦克风图标**不出现网页卡片**，弹出原生录音界面；停止后能拖两端裁剪、能预览所选区间、确认后网页收到文件并走上传链路；`gradlew :app:testDebugUnitTest` 全绿（含 accept 判定与裁剪算术）。
7. `npx tsc --noEmit` 0 错误；`pnpm test` 全绿（含新增用例，按测试名确认真的跑了）；`node scripts/check-admin-classes.mjs` 缺失 0。

## 7. 风险与既定假设

- **跨浏览器播放**：Chrome/Firefox 录的是 WebM/Opus，**iOS Safari 播不了**（不是本次引入的缺陷，是本轮"不强制 MP3"的直接代价）。App 录的 M4A/AAC 全平台可播；渲染端给播不动的浏览器一句降级提示。要彻底统一格式就得引 MP3 编码器或服务端 ffmpeg —— 用户本轮已明确不要。
- **`peaks` 是尽力而为**：网页录音有真实峰值；App 录音与媒体库选取拿不到，用按 key 确定性生成的图案兜底（同一段音频每次一样）。真要真实峰值，得让宿主把采样经 `evaluateJS` 回传 —— 本轮不做（少一条契约、少一处竞态）。
- **设备实测**：本轮已在 Android 11 模拟器上跑通「录音 → 停止 → 裁剪试听 → 使用 → 上传 → 发布区」全链路（见 §9）。模拟器麦克风是静音源：链路与布局可信，**音质/波形好不好看要真机看**；真机手感（振动、机型差异、`RECORD_AUDIO` 弹窗文案）仍未覆盖。
- **自造 MIME 会被 Gecko 过滤**：标记 `audio/x-smartblog-voice` 到不了宿主（实测），所以录音判定**必须**同时认 `capture != 0` + 全音频 accept（见 §2.5 的提醒）；哪天 Gecko 改了 capture 语义，这条路会在真机上失效（表现为"点了麦克风弹系统选择器"）。
- **「非音频 ≤ 9」维持现状**：`images` 数组的 zod 上限提到 14 是为了给 5 条语音腾位置，非音频的 9 条上限沿用今天的硬编码（与后台 `uploadMaxImagesPerBatch` 的既有不一致不在本轮范围内）。
- **M4A 容器品牌**：Android `MediaMuxer` 写的主品牌不是 `M4A `，所以 §2.3 的容器判定是**必需项**而不是优化项；若后续 GeckoView/Android 行为变化，判定失败会退化成"上传被拒"，不会静默存错类型。

## 8. 审批

- [x] 用户已批准（本轮问答：不强制 MP3 / App 原生自绘 / 可混发分区展示 / 落 Spec 后直接实现）
- [x] 实施完成（见 §9）
- [x] 文档已同步（见 §9 末列）

## 9. 实施结果与验证（2026-10-11）

**站点侧（`main/`）**

- 新增：`lib/moments/peaks.ts`（波形峰值归一化 + 确定性图案，纯整数运算保证 RSC/水合一致）、`lib/upload/audio-container.ts`（纯音频的 MP4/WebM 容器判定）、`lib/uploads/kind-filter.ts`、`lib/client/voice-recorder.ts`（MediaRecorder mime 选择/扩展名/错误文案，纯逻辑）、`components/admin/{MomentVoiceButton,VoiceRecorderPanel,UploadsKindFilter}.tsx`、`components/moment/MomentAudioRow.tsx`（播放行 + 首页小标）、`components/common/MicIcon.tsx`（Radix 1.3.2 里没有麦克风图标，自绘）、`scripts/voice-e2e-check.mjs`（真浏览器端到端验收）。
- 改：`lib/moments/{types,compose-rules,query,admin-list-view}.ts`（`kind: "audio"` + `peaks` + 分区/计数唯一入口 `splitMomentMedia()`）、`lib/validation/post.ts`（媒体项加 audio/peaks，数组上限 9 → 14）、`lib/upload/{handle,limits}.ts`（音频-only 容器修正 + `VOICE_RECORD_MIME` 契约）、`lib/client/upload.ts`（`durationSec` 透传：浏览器录的 WebM 头部没有时长）、`lib/feed/updates.ts`（「发了一段语音」）、`lib/proxy.ts`（`/admin/moments` 放开 `microphone=(self)`，其余仍然 `()`）、`components/admin/{MomentCompose,MomentAdminList,UploadCard,UploadsAlbumFilter,AdminWorkspace}.tsx`、`components/moment/MomentGrid.tsx`、`components/home/modules/{MomentCard,MomentsModule}.tsx`、`app/admin/(protected)/{page,moments/page,uploads/page}.tsx`、`app/{globals,admin/admin}.css`、`scripts/check-admin-classes.mjs`（登记三个新后台组件）。

**站点验证（可复现）**

- `npx tsc --noEmit` **0 错误**；`pnpm test` **448 通过 / 0 失败**（较改造前 423 条，新增 peaks 6、audio-container 7、kind-filter 1、voice-recorder 6、compose-rules 5、feed 2）；`node scripts/check-admin-classes.mjs` **引用 247 个类名、缺失 0**。
- **真浏览器端到端**（`node scripts/voice-e2e-check.mjs`，Edge headless + `--use-fake-device-for-media-stream` 假麦克风，**13 项全绿**）：
  1. 点麦克风 → 卡片弹出且 `position: fixed`、贴顶（实测 `top` = CSS 的 14px，取景时动画进行中读到 5px）、666×55 长条，**左波形 / 中计时 / 右停止**；
  2. 录制态实时波形 30 根、最高 21px，计时 `0:01 → 0:02`；
  3. 点停止 → **自动上传成功**（`voice-2026-10-11-….webm` 走既有传输 HUD）→ 发布区出现语音行（时长 0:02、31 根波形、可试听可删除）；
  4. 发布 → `/moments` 上语音是**独立播放行**（与九宫格分区分开），`<audio>` 真播起来（`currentTime > 0`）；
  5. 媒体库 `?kind=audio` → 只有 1 张音频卡（`0:02` + 播放键），`?kind=image` → 0 张音频卡；
  6. **真实容器夹具（ffmpeg 造，主品牌 `mp42` —— 与 Android `MediaMuxer` 同形）**：音频-only 的 `.mp4` 按 `kind=audio` → **HTTP 200 / `audio/mp4`**（这条就是 App 录音那条路）；带视频轨的 `.mp4` 声明成 `kind=audio` → **400 `MEDIA_KIND_MISMATCH`**（容器复核没给伪装开后门）；
  7. 收尾自动删掉本次测试的瞬间与两条媒体（DELETE 均 200），开发库还原。
- **这一步同时证明了 §2.3 的容器修复是真的**：第 3 条里的 WebM 与第 6 条里的 M4A 都是"`file-type` 会说 `video/*`"的文件；没有容器复核，它们都会被 400 挡掉。

**Android 侧（`androidapp/`）**

- 新增：`MediaKinds.isVoiceRecordRequest()`（accept 标记 / capture 判定，纯逻辑）、`VoiceRecorderPolicy.kt`（上限、振幅换柱高、下采样、裁剪区间算术、时钟）、`AudioRecorder.kt`（MediaRecorder：MPEG_4 + AAC 128 kbps 单声道 → `cacheDir/voice/`）、`AudioTrimmer.kt`（`MediaExtractor` + `MediaMuxer` 裁剪，**不重编码、不引 ffmpeg**）、`VoiceRecorderView.kt`（原生录音小窗：弹入动画 + 实时波形 + 停止后整段波形拖两端裁剪 + 试听）与 `VoiceRecorderPolicyTest.kt`。
- 改：`MainActivity.kt`（`onFilePrompt` 加录音分支、`RECORD_AUDIO` 运行时授权、`onPause` 取消录音、`onDestroy` 兜底释放）、`AndroidManifest.xml`（`RECORD_AUDIO`）、`MediaKindsTest.kt`（+2 用例）。
- 验证：`gradlew :app:testDebugUnitTest` **74 通过 / 0 失败**（较改造前 65 条，新增 MediaKinds 2 + VoiceRecorderPolicy 7）；`gradlew :app:assembleDebug` **BUILD SUCCESSFUL**。
- **Android 11 模拟器（1080×2280）真机链路实测**（2026-10-11 补，上一轮唯一缺的就是这一段）：
  1. `onFilePrompt type=1 mime=audio/webm, audio/mp4, audio/ogg capture=2` → 认成录音请求 → 弹原生小窗（**同时证明 Gecko 过滤掉了自造 MIME，靠 `capture` 兜底才认出来**）；
  2. 录制态：`0:04` 时波形从**左侧**约 40% 起向右长、槽宽不变（不是"越录越细"）、计时在走、「取消 / 停止」**可见且可点**；
  3. 点「停止」→ 日志 `录音完成：63418 字节` → 切到「剪一段」：整段波形铺满 + 两端手柄 + `起 0:00 / 止 0:05`；
  4. 点「试听」→ 按钮变「暂停」、播放头沿波形走；
  5. 拖右手柄到 ~65% → `止 0:03`、选区外压暗、正在试听时按新起点重新定位（这条就是"裁剪时的试听体验"）；
  6. 点「使用」→ 日志 `裁剪完成：150 个采样，45027 字节`（**真裁剪**，原 63418）→ `文件选择完成：1 个` → 页面出现语音行（▶ + 波形 + `0:03` + 删除），麦克风角标 `1`；
  7. 相册：视频瓦片同时显示 `0:05`（时长）与 `423 KB`（**体积**，用户本轮追加的口径）。
- 仍未做：非模拟器真机的手感/机型差异（模拟器麦克风是静音源，只能验链路与布局，验不出"波形好不好看"）；截图在本机 `.ui-shots/android-*.png`（已 gitignore）。

**顺带修掉的两处（冰山下面那层）**

- 页面副文案还在说「文章和瞬间用过的图片」/「记录此刻的想法与图片」→ 补上视频与语音（`AdminWorkspace.tsx`）。
- 浏览器录音的 WebM 头部没有时长，媒体库那张卡会只显示「音频」→ 上传时把录音时长一起带上（`UploadAdminOptions.durationSec`），现在显示 `0:02`。

## 10. 2026-10-17 追修（用户报的三个问题）

1. **APP 取消后仍占用麦克风**：`AudioRecorder.cancel()` 原来用 `file ?: return` 早退，且 `release()` 只 release、不 stop；`VoiceRecorderView.shutdown()` 又走另一条清理路径。现在 `cancel()` / `release()` 共用一个无条件的 `stop → reset → release` 出口，`file` 为空也照样释放，`shutdown()` 只调它。录音器本身是系统 API，JVM 单测只能锁纯逻辑；本次门禁是 `:app:testDebugUnitTest` 与 `:app:assembleDebug` 全绿，真机麦克风占用需设备复核。
2. **波形方向反了**：用户最终口径是**从最左开始向右生长；满 10 秒后整条向左滚动**。Web 的 `liveSampleIndexFor()` 改为槽位=下标，Android 的 `VoiceRecorderPolicy.liveSlot()` 改为 `arrayIndex` 直接夹取；两边单测同步改为 0…29（3 秒）与“满窗后丢头”。旧实现（最新贴右）已废弃。
3. **网页一直没权限、也不弹窗**：根因不是浏览器设置，而是 `/admin` 概览页也渲染了 `MomentCompose`，但 `Permissions-Policy` 只给 `/admin/moments` 放开麦克风。现在两页都放开（`lib/security/permissions-policy.ts` 唯一判定，配单测）；其它页面仍 `microphone=()`。真实验收用响应头核对：`/admin` 与 `/admin/moments` = `microphone=(self)`，`/admin/uploads` = `microphone=()`。
4. **上传文件名过长/错后缀**：新增 `lib/upload/file-name.ts`（客户端先压到 80 字符；服务端只要求文件名后缀与嗅探类型**同属图片/视频/音频**，不再逐字要求容器一致）；Android 的 `PickedFileName.kt` 同步压短临时文件名。真实浏览器用 90+ 字符的 `img-….jpg` 文件名 + WebP 内容上传，返回 200 且入库 `image/webp`。

## 11. 2026-10-17c 追修：权限页放行后仍然“没权限”

- **复现口径**：不是浏览器设置问题，DevTools 明确报 `Permissions policy violation: microphone is not allowed in this document`。
- **根因（文档级策略）**：`Permissions-Policy` 属于**顶层文档**，Next `<Link>` 软导航不会重新请求文档。上一版只给 `/admin` 与 `/admin/moments` 两个 URL 放行：
  - 在后台从 `/admin/posts` 软导航到 `/admin/moments`，文档仍沿用 `/admin/posts` 的 `microphone=()`；
  - 从公共页面（Footer「管理后台」/ Navbar「外观」）软导航进后台，文档仍沿用公共页面的 `microphone=()`。
- **修法**：①`lib/security/permissions-policy.ts` 改成整个 `/admin` 路径树放行 `microphone=(self)`，公共页面和 API 仍关闭；②Footer 与 Navbar 外观入口改 `<a>` 做文档级跳转，确保进入后台时拿到后台文档的响应头；③单测锁 `/admin/posts` 也为 `(self)`、`/moments` 仍为 `()`、`/administrator` 不被前缀误伤。
- **轻量 dev 核对**：临时库登录后 `/admin`、`/admin/posts`、`/admin/moments` 均 200，响应头均为 `camera=(), microphone=(self), geolocation=()`，页面无 Prisma 报错；公共 `/` 与 `/moments` 仍为 `microphone=()`。真实浏览器点录音的权限弹窗仍需用户在本机授权一次。

## 12. WebM 通用性结论（2026-10-17）

### 12.1 当前实现

- 录音 mime 候选顺序：`audio/webm;codecs=opus` → `audio/webm` → `audio/ogg;codecs=opus` → `audio/mp4`（见 `lib/client/voice-recorder.ts` 的 `VOICE_MIME_CANDIDATES`）。
- Chrome / Edge / Firefox / Android 通常落到 **WebM/Opus**；旧版 Safari 不支持 WebM 录制时落到 **MP4/AAC (m4a)**。
- 服务端不转码，按 `file-type` + `audio-container.ts` 判成 `audio/webm` 或 `audio/mp4` 原样存储；WebM 的扩展名是 `.weba`。
- 前台播放失败时 `MomentAudioRow` 不假装能播，显示下载链接；不会静默黑屏。

### 12.2 兼容性判断

| 场景 | WebM/Opus | MP4/AAC |
|---|---|---|
| Chrome / Edge / Firefox / Android 播放 | 好 | 好 |
| macOS Safari 14.1+ 播放 | 基本支持，但历史版本对 Opus 容器支持有差异 | 好 |
| iOS Safari 15.4–17.3 的 `<audio>` 播放 | **不稳定/可能放不了** | 好 |
| iOS 18.4+ 录制 WebM | 支持（Safari 从 18.4 起可录 WebM） | 支持 |
| 旧 iOS / 老设备 | 可能完全不支持 | 好 |
| 微信/部分系统播放器/分享后直接播 | 不保证 | 更稳 |

参考：[MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)、[Can I use WebM](https://caniuse.com/?search=WEBM)、[ChromeStatus: MP4 container for MediaRecorder](https://chromestatus.com/feature/5163469011943424)。

### 12.3 结论

- **对“录制”本身**：现代浏览器基本都能录；不支持 WebM 的 Safari 会自动落 MP4，所以后台录音不会因为格式被卡死。
- **对“发布后给所有人播放”**：WebM/Opus **不是全平台通用格式**。Chromium/Firefox/Android 没问题，但旧 iPhone/iPad 或旧 Safari 可能只能下载、不能直接播。
- 如果站点读者主要是电脑 + Android，用 WebM 可接受；如果在意 iPhone 全版本直接播放，就需要 MP4/AAC（转码，或 Safari 录制时优先 MP4）。当前“Chrome 录 WebM → iPhone 播放”的链路没有转码，不能承诺全平台。
- 无服务端转码时的低成本改进：把 `audio/mp4` 提到候选前面，让 Safari 优先录 M4A；但这只改善 Safari 录制，Chrome 仍会录 WebM，不能解决已有 WebM 在旧 iPhone 的播放。
