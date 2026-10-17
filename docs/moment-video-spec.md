# Spec：瞬间发视频 + App 相册选视频 + 媒体库上传下拉 + App 内置 ffmpeg 压缩

- 日期：2026-10-11
- 提案人：AI
- 状态：**已批准 / 已实施**（用户 2026-10-11 批准「按 Spec 开工，基本验证即可，高级验证自己来」；实现与验证结果见 §9）
- 关联：[moments-home-spec.md](moments-home-spec.md)、[moment-visibility-spec.md](moment-visibility-spec.md)、[albums-spec.md](albums-spec.md)、[android/architecture.md](android/architecture.md)、[android/photo-edit-spec.md](android/photo-edit-spec.md)、[api-contracts.md](api-contracts.md)

## 1. 目标

用户提的四件事，一次落地：

1. **瞬间可以不发文字**——只要带了图片或视频就能发（空文字不再拦发布）。
2. **瞬间可以发视频**，并且 **App 自带相册支持选择和上传相册里的视频**（现在只有纯图片 `accept` 才弹自有相册，视频一律丢给系统选择器）。
3. **媒体库上传按钮在 App 里变成下拉**：检测到请求来自 App（UA `SmartBlog`）就弹出两项——「相册视图（图片/视频）」与「默认文件视图（图片/视频/音频）」；浏览器里保持现状（点了直接开文件对话框）。
4. **App 内置 ffmpeg 视频压缩**：相册视图多一个「自动压缩视频」勾选框（默认开、可关），选中视频后按 **码率 > 4 Mbps 或 大小 > 50 MB**（以及"容器不是 mp4/webm"）自动压缩；压缩器用 ffmpeg 并预留音频处理的扩展位。**2026-10-11 追加的硬规则（用户决策）：时长超过 30 分钟的视频一律不许发**（客户端在选择阶段拦、服务端在声明了 `duration` 的路径上兜底），且"压不进站点上限"的视频直接拒绝并给一句人话，不启动 ffmpeg 硬编。

用户已拍板的口径（本轮问答）：

- ffmpeg 用社区维护的 Maven Central drop-in 包 **`dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7`**（含 x264）。代价：该 AAR 是 **GPL-3.0**，整个 App 需按 GPL-3.0 分发；本仓库公开，合规成本可接受。
- 一条瞬间 **图片与视频可以混排，但最多 1 个视频**（其余位置仍是图片，合计仍受「一次最多选几张」上限约束，默认 9）。

## 2. 设计方案

### 2.1 数据模型：瞬间媒体数组里加 `kind`（不迁移）

`Moment.images` 是 JSON 字符串数组，**不加列、不迁移**；每项按需多带字段：

```ts
type MomentMedia = {          // 现名 MomentImage，保留名字减少无谓改名
  key: string;                // 原图 / 原视频的媒体 key（与现在同一套）
  thumb?: string;             // 图片的一级缩略图；视频没有（站点不装 ffmpeg）
  width?: number;
  height?: number;
  kind?: "image" | "video";   // 缺省 = image（旧数据零改动）
  mime?: string;              // 视频：真实 mime（video/mp4、video/webm）
  duration?: number;          // 视频：秒（发布端探测，可缺失）
};
```

- 公开投影（`lib/moments/query.ts`）：视频的 `src` 仍走 `resolvePublicImageUrl(key)`（同一套 COS/站内地址），**没有 `thumbSrc`**；首页投影不再为视频查二级缩略图。
- 渲染端一律 `kind === "video"` 分支，**不用 `mime` 猜**（缺 kind 当图片，保证旧数据不变）。

### 2.2 站点侧：发瞬间支持视频 + 文字可空

| 位置 | 改法 |
|---|---|
| `lib/validation/post.ts` | `momentWriteSchema` 的 `content` 允许空；媒体项加 `kind`/`mime`/`duration`；新增「文字或媒体至少一个」与「视频 ≤ 1 个」两条。**注意 `momentPatchSchema` 目前是 `momentWriteSchema.partial()`**，加了 `refine` 就调不动 → 拆出 `momentBaseSchema`（纯对象），写 schema = base + refine，patch schema = base.partial()，PATCH 的「至少一个」在 `updateAdminMoment()` 里对照现有行判定 |
| `lib/moments/admin.ts` | `createAdminMoment()` 直接落库（schema 已校验）；`updateAdminMoment()` 合并「入参 + 现有行」后复用同一条「文字或媒体至少一个」判定 |
| `components/admin/MomentCompose.tsx` | 输入框可为空；提交按钮只在「无文字且无媒体」时禁用；按每个文件 `guessUploadKind()` 分组上传（`uploadAdminFiles` 一次只吃一种 kind）；上传视频走 `defer` + 发布前 `finalizeAdminUploads()`（现链路已支持视频，`writeDerivatives()` 对非图片直接跳过）；**第 2 个视频时报错并忽略**；本机 blob 预览登记表照用（图片/视频同一套） |
| `components/admin/MomentImageButton.tsx` | 文案与 `accept` 加视频（具体 MIME 列表，与 `MEDIA_ACCEPT` 里的视频项一致）；「从媒体库选择」传 `kinds=["image","video"]` |
| `components/admin/SortableImageGrid.tsx` | item 多一个 `kind`；视频格渲染 `<video muted playsInline preload="metadata">` + ▶ 角标；拖拽/删除/稳定 id 逻辑不动 |
| `components/admin/MediaLibraryPicker.tsx` | 由单 `kind` 扩成 `kinds?: AdminUploadKind[]`（缺省 = 原单值）；文案「张」→「个」 |
| `app/api/admin/uploads/route.ts` + `lib/uploads/admin.ts` | `?kind=` 支持逗号分隔多值（`image,video`），单值行为不变；`mimePrefixForKind` 扩成 `mimePrefixesForKinds()`，where 走 `OR` |
| `components/moment/MomentGrid.tsx` | 图片走灯箱（不变）；视频用 `MomentVideoPlayer`：**首帧预览 + 自绘播放器**（`controls={false}`，播放/暂停、进度、音量），**不进灯箱**；单视频时满宽按 `width/height` 定比例 |
| `components/home/modules/MomentCard.tsx`、`MomentsModule.tsx` | 视频格同样是 `MomentVideoPlayer` 的首帧预览（不是暗色占位）；预览按钮压过整卡链接，点视频开播放器、点其它区域仍进 `/moments#moment-{id}`；不请求 `thumb2Src` |

### 2.3 站点侧：媒体库上传按钮在 App 内变下拉

- **判定唯一入口**仍是 `lib/client/detect.ts` 的 `isSmartBlogApp()`：`app/admin/(protected)/uploads/page.tsx` 是服务端组件，`headers().get("user-agent")` → `appMode` 布尔值下传 `UploadsToolbar`（不在客户端再写一遍 `includes("SmartBlog")`）。
- `UploadsToolbar`：

| 判定 | 点「上传」的行为 | 隐藏 input 的 accept |
|---|---|---|
| 浏览器（现状） | 直接开文件对话框 | `MEDIA_ACCEPT`（图片 + 视频 + 音频） |
| App | 弹两项小卡：**相册视图（图片 / 视频）** / **文件视图（图片 / 视频 / 音频）** | 相册视图：只含 image/* 与 video/mp4、video/webm 的具体 MIME（**不含 audio**，否则 App 会判成混合媒体走系统选择器）；文件视图：`MEDIA_ACCEPT` |

- 小卡是自绘浮层（与 `MomentImageButton` 的 pop 同一套做法：点外/Esc 关闭）；两条路径最终都汇入现有「先预览、再上传」弹窗，**上传/相册归属/进度逻辑零改动**。

### 2.4 App 侧：相册视图支持视频

`MainActivity.isImageOnlyAccept()` 扩成「可交给相册的媒体判定」：

| `prompt.mimeTypes` | 走哪 | 相册展示 |
|---|---|---|
| 全是 `image/*` | 自有相册 | 只图片（现状不变，瞬间配图/编辑器插图/封面） |
| 全是 `video/*` | 自有相册 | 只视频（编辑器「插入视频」也能用上压缩） |
| 只含 `image/*` + `video/*`（无 audio、无其它） | 自有相册 | 图片 + 视频（本 Spec 新增：瞬间配图、媒体库相册视图） |
| 其它（含 audio/扩展名/任意文件） | 系统选择器 | —（现状不变） |

`AlbumPickerView` 的改动：

- 数据源：`MediaStore.Images` + `MediaStore.Video` 两路查询（`_ID/BUCKET_*/DATE_ADDED/SIZE/DURATION/WIDTH/HEIGHT/BITRATE`），按 `DATE_ADDED DESC` 归并；相册集（bucket）合并统计，切换相册仍是内存过滤、不重查。
- 权限：Android 13+ 加 `READ_MEDIA_VIDEO`；≤32 的 `READ_EXTERNAL_STORAGE` 已声明。拒绝 → 退回系统选择器（沿用现有分支）。
- 缩略图：图片仍走 `PhotoFiles.decode()`（带 EXIF 纠正）；视频走系统缩略图（API 29+ `ContentResolver.loadThumbnail`，26–28 `MediaStore.Video.Thumbnails`），失败给 ▶ 占位块；缓存 key 仍是 `uri#revision`。
- 选择：沿用唯一的 `PickerSelection`（视频不参与 `PhotoEditStore` 编辑，`resolve()` 对视频是恒等）。
- 预览：点视频格进新增的 `VideoPreviewView`（`VideoView` + 播放/暂停 + 「选择」/返回，**不引依赖**）；点图片仍进 `PhotoPreviewView`；`handleBack()` 逐层退的顺序不变。
- 文案：按允许的媒体类型给「选择一张照片 / 选择一段视频 / 选择照片或视频」「最多选 N 个」。

### 2.5 App 侧：ffmpeg 压缩器 + 勾选框

**依赖与构建**

- `androidapp/app/build.gradle.kts` 加 `implementation("dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl:8.1.7")`（Maven Central；SDK35、16KB 对齐；ABI 只有 arm64-v8a + x86_64）**并手补 `implementation("com.arthenica:smart-exception-java:0.2.1")`** —— 维护版 AAR 的 POM 里没有 `<dependencies>` 段，不补就是"第一次点压缩必闪退"（`NoClassDefFoundError`，见 P-183 与 §9）。
- `gvAbi` 决定 ABI：加 `ndk.abiFilters` 只打所选 ABI（免得 AAR 里另一套 so 把包撑大）；`gvAbi == "armeabi-v7a"` 时**不加**该依赖并置 `BuildConfig.FFMPEG_ENABLED=false`，相册勾选框置灰、视频原样上传（功能降级，不阻塞构建）。**注意：降级只影响"压不压"，30 分钟硬规则照样拦**。
- GPL-3.0：Spec 批准即代表接受整个 App 按 GPL-3.0 分发；`docs/android/build.md` 记明依赖坐标、许可证与 ABI 约束。

**纯逻辑（可 JVM 单测）`CompressPolicy.kt`**

```
VideoMeta(sizeBytes, durationMs, width, height, bitrateBps, mime)
MAX_DURATION_MS = 30 分钟                     // 硬规则（用户决策 2026-10-11）
decide(meta, enabled, serverMaxBytes) -> Decision(compress, plan, refusal)
    ① isTooLong(meta) → 拒绝（与 enabled 无关）：「这段视频 42:01 超过 30 分钟上限：请先剪短再发」
    ② !shouldCompress(...) → 不压、不拒绝
    ③ planBySize 的码率（含 600kbps 下限）估出来仍超目标体积 → 拒绝：「…太长，压不到 10MB 以内…」
shouldCompress(meta, enabled, serverMaxBytes)
    = enabled && (容器不在白名单 || 码率 > 4_000_000 || 体积 > 50MiB || 体积 > serverMaxBytes)
plan(meta, serverMaxBytes) -> Plan(maxLongEdge, videoBitrateBps | null, crf, preset, audioBitrateBps, targetBytes)
    默认：长边 ≤1920（不放大）、x264 veryfast、CRF 24、maxrate 4M/bufsize 8M、AAC 128k、+faststart、-threads 2
    预估产物 > 目标体积时：按 duration 反推总码率（下限 600 kbps，且**不超过源码率**），必要时长边降到 1280 / 720
```

边界：`=4 Mbps`、`=50 MiB`、`=30:00` 都不拦（严格大于才拦）；时长/码率缺失时用 `size*8/duration` 推算，仍缺就只按大小与容器判；开关关闭时**不做压缩**，但 30 分钟规则与"压不进去"的拒绝仍生效（规则不依赖开关）。

**执行器 `FfmpegEngine.kt`**

- `FFmpegKit.executeAsync(args, complete, log, statistics)`；进度 = statistics 的 `time / durationMs`（夹 0–100，只许前进）。
- 输出落 `cacheDir/compressed/compress-<时间戳>.mp4`，**系统相册原文件一个字节不动**；失败/取消 → 直接交原文件并在页面上给一句提示（绝不把不能播放的产物交出去）。
- `clearOutputDir()` 在**每次打开相册前**清（与 `PhotoFiles.clearEditedDir()` 同一时机、同一理由：产物要被 `confirmPending()` 消费完）。
- 预留音频扩展位：引擎只暴露「跑一条 ffmpeg 命令 + 进度」，后续音频处理加命令即可。

**UI**

- 相册顶部第三行只在「允许视频」时出现：`Switch/CheckBox`「自动压缩视频」+ 小字「码率 >4Mbps 或 >50MB 时自动压缩」；默认开。
- 点「完成」后若需压缩：居中卡片 `正在压缩 1/2 · 42%` + 「取消」（`FFmpegKit.cancel(sessionId)`）。
- 服务端上限来自 `GET /api/upload/limits` 的 `maxBytes`（`MainActivity` 已有一个 `refreshUploadLimits()`，扩成同时存 `maxBytes`，取不到用 10MB 兜底）；这样「站点上限设成 10MB 也能传上去」。

## 3. 影响面分析

- **涉及模块**：站点侧 `lib/moments/*`、`lib/validation/post.ts`、`components/admin/{MomentCompose,MomentImageButton,SortableImageGrid,MediaLibraryPicker,UploadsToolbar}`、`components/moment/MomentGrid`、`components/home/modules/{MomentCard,MomentsModule}`、`app/admin/(protected)/uploads/page.tsx`、`app/api/admin/uploads/route.ts`、`lib/uploads/admin.ts`、`lib/client/detect.ts`（复用不改造）；Android 侧 `MainActivity.kt`、`AlbumPickerView.kt`、新增 `VideoPreviewView.kt`/`CompressPolicy.kt`/`FfmpegEngine.kt`、`AndroidManifest.xml`、`app/build.gradle.kts`。
- **新增/变更配置字段**：无新 Setting。`uploadMaxSizeMB`（1–50，默认 10）继续作视频/音频单文件硬上限；App 压缩以它为目标上限，**不改默认值、不改读写路径**。
- **是否破坏红线**：不破坏。文件读写仍只经 `lib/storage`；无原生 SQL；无 Prisma schema 变更（因此无迁移、`data-clear` 覆盖清单不动）；vendor 冻结子树不动；站点侧零新依赖（仍满足 1GB RAM / 单实例约束）。
- **新增依赖（Android 侧）**：`ffmpeg-kit-min-gpl`（GPL-3.0，单 ABI 的 so 体积实测后写进 docs，预期十几 MB 量级）；不引入任何 Android UI/图片库（缩略图、播放器全用系统 API 自绘）。站点侧无新依赖。

## 4. 输入输出边界（API / 数据模型）

- `POST /api/admin/moments`：`content` 允许空字符串；`images[]` 每项可带 `kind/mime/duration`；**必须满足「文字非空 或 媒体非空」且视频 ≤ 1**。PATCH 沿用同一形状（`momentPatchSchema` 保持 partial 语义）。
- `GET /api/admin/uploads?kind=`：`kind` 支持逗号分隔多值（`image,video`）；缺省/非法值 = 不过滤（现状）。
- `GET /api/upload/limits`：响应体已是 `{maxImages, maxBytes, imageTypes}`，**不改契约**；App 侧开始使用 `maxBytes`。若后续要区分视频类型可再加字段（本次不加）。
- 数据模型：无 Prisma 变更、无迁移；`Moment.images` 的 JSON 形状向后兼容（旧行缺 `kind` = 图片）。

## 5. 实施步骤

1. 站点侧数据层：类型（`lib/moments/types.ts`）、校验（`lib/validation/post.ts` 拆 base/refine）、admin 写入判定、公开/首页投影。
2. 站点侧 UI：MomentCompose / MomentImageButton / SortableImageGrid / MediaLibraryPicker（多 kind）/ MomentGrid / MomentCard / MomentsModule。
3. 站点侧媒体库下拉：uploads page 传 `appMode` + UploadsToolbar 两项小卡 + 多 kind 列表接口。
4. 站点侧单测与验证：新增/更新用例（校验、投影、下拉 accept 判定），`npx tsc --noEmit`、`pnpm test`、`node scripts/check-admin-classes.mjs`、真浏览器渲染与交互证据。
5. Android 相册：`AlbumPickerView`（视频数据源/缩略图/预览/文案）+ `VideoPreviewView` + Manifest 权限 + `MainActivity` 判定与上限下发。
6. Android 压缩：`CompressPolicy`（+ JVM 单测）→ `FfmpegEngine` → 勾选框/进度卡接线 → `clearOutputDir` 时机。
7. Android 验证：`gradlew :app:testDebugUnitTest`、`:app:assembleDebug`，并从产物里取证（so/x264、APK 体积差）；有 AVD 就跑一遍真机流程，没有就明确记录「未做设备实测」。
8. 文档同步 + changelog + AGENTS/module.md 状态行，最后过 `delivery_check`。

## 6. 验收标准

**站点（可复现）**

1. 只发 1 张图、正文留空 → 发布成功；前台该瞬间只有图、没有空段落。
2. 只发 1 个视频（≤ 站点上限）→ 发布成功；`/moments` 里点视频能开自绘播放器；首页瞬间卡/首页瞬间模块显示视频首帧预览（不是黑块/破图）。
3. 正文与媒体都空 → 提交被拦并给明确文案（不发请求）。
4. 一次选 2 个视频 → 第 2 个被拒并提示「一条瞬间最多 1 个视频」；「从媒体库选择」同样生效。
5. 浏览器 UA 打开 `/admin/uploads`：点上传直接出文件对话框（无下拉）；带 `SmartBlog/0.1.3` UA 的服务端渲染结果里出现两项下拉，且「相册视图」的 input `accept` **不含 audio**、只含 image/video。
6. `npx tsc --noEmit` 0 错误；`pnpm test` 全绿（含新增用例）；`node scripts/check-admin-classes.mjs` 缺失 0。

**Android（可复现）**

7. `gradlew :app:testDebugUnitTest` 全绿（`CompressPolicy` 覆盖阈值边界 / 关掉不压 / 服务端上限 / 码率反推 / **30 分钟边界** / 压不进去的拒绝 / 探测补值 / 线程上限）。
8. `gradlew :app:assembleDebug` 绿；产物里能查到 ffmpeg 的 so（以及 min-gpl 带来的 x264 编码器）。
9. 设备/模拟器实测：瞬间配图 → 相册里能看到视频格与「自动压缩视频」开关；选一个 > 4 Mbps 或 > 50 MB（或容器不是 mp4/webm）的视频 → 点完成出现压缩进度 → 页面收到的文件变成 **mp4** 且明显变小；关掉开关再选一次 → 原样返回；**选一条 > 30 分钟的视频 → 被拒并提示「超过 30 分钟上限」且 App 不崩**（勾选框开/关都要验一次）。
10. 媒体库上传按钮在 App UA 下出现两项；选「相册视图」→ 弹相册（图+视频），选「文件视图」→ 系统选择器（含音频）。

## 7. 风险与既定假设

- **GPL-3.0**：min-gpl 含 x264，整个 App 按 GPL-3.0 分发（用户已选，源码本就公开）。
- **站点不生成视频封面图**：服务器不装 ffmpeg（1GB RAM 约束）。浏览器端用 `<video preload="metadata">` seek 到 0.1s 显示**首帧**（失败时保持渐变占位，不闪黑）；App 相册里用系统缩略图。
- **站点单文件上限**：默认 10 MB 是视频的硬上限。App 路径会自动压到上限以内；**浏览器路径**超限会报错——要发大视频请在后台把「上传大小上限」调到 50 MB（设置页，1–50 可调）。本次不改默认值。
- **armeabi-v7a**：该 ABI 没有 ffmpeg 包，功能降级（系统选择器 + 不压缩），构建不失败。
- **设备实测**：若本机没有可用 AVD/真机，Android 侧只交付「编译 + JVM 单测 + 产物取证」，并在交付说明里明确未做设备实测。

## 8. 审批

- [x] 用户已批准（2026-10-11：「可以，按 Spec 开工，验证的时候只需基本验证能不能跑起来，高级的我自己去验证」）
- [x] 实施完成（站点侧 + Android 侧，见 §9）
- [x] 文档已同步：[moments-home-spec.md](moments-home-spec.md) §2.8、[albums-spec.md](albums-spec.md) §3.7、[api-contracts.md](api-contracts.md)、[data-models.md](data-models.md)、[ai/module.md](ai/module.md)、[android/architecture.md](android/architecture.md) §6b/§6b-1/§6b-3、[android/build.md](android/build.md) §3b、[android/README.md](android/README.md)、[pitfalls.md](pitfalls.md) P-181/P-182 + P-143 追加、[README.md](../README.md)、AGENTS.md §3/§6、[README.md](README.md) 职责表

## 9. 实施结果与验证（2026-10-11）

**站点侧（`main/`）**

- 新增 `lib/moments/compose-rules.ts`（跨字段规则 + 文案，纯函数）、`lib/moments/compose-rules.test.ts`；改 `lib/moments/types.ts`（`momentMediaKind()`）、`lib/moments/query.ts`（视频投影不查二级缩略图）、`lib/validation/post.ts`（base + superRefine 拆分）、`lib/moments/admin.ts`（PATCH 合并判定）、`lib/feed/{updates,query}.ts`（只发媒体的通知文案）、`lib/upload/limits.ts`（`VIDEO_UPLOAD_MIME_TYPES` / `MEDIA_UPLOAD_MIME_TYPES`）、`lib/uploads/{locations,admin}.ts`（`?kind=` 多值）、`lib/client/upload.ts`（`readMediaProbe()`）、`components/admin/{MomentCompose,MomentImageButton,SortableImageGrid,MediaLibraryPicker,UploadsToolbar}.tsx`、`components/moment/{MomentList,MomentGrid}.tsx`、`components/home/modules/{MomentCard,MomentsModule}.tsx` + `lib/moments/waterfall.ts`、`app/admin/(protected)/uploads/page.tsx`（服务端 UA → `appMode`）、`app/globals.css` + `app/admin/admin.css`。
- 验证：`npx tsc --noEmit` **0 错误**；`pnpm test` **423 通过 / 0 失败**（较改造前 410 条，新增 compose-rules 6、mimePrefixesForKinds 1、瞬间通知兜底 2、waterfall 视频瓦片 1、`MomentGrid` 视频渲染首帧 3）；`node scripts/check-admin-classes.mjs` **引用 243 个类名、缺失 0**；dev server 上 `/moments` 200、`/admin/login` 200、`/admin/uploads` 307（未登录重定向，符合预期）。
- **未做**：`/admin/uploads` 的 App UA 分支与「相册视图 / 文件视图」下拉没有做端到端点击验证（后台页面需要管理员会话），只验证了服务端判定函数 `isSmartBlogApp()` 与渲染分支的静态正确性；发瞬间的**完整发布链路**（选视频 → upload → finalize → 前台播放）留给用户走一遍 —— 我在设备上验到"页面收到压缩后的 mp4"为止（见下）。

**Android 侧（`androidapp/`）**

- 新增 `MediaKinds.kt`（accept → 相册媒体组合）、`CompressPolicy.kt`（规则/阈值/ffmpeg 参数，纯逻辑）、`MediaProbe.kt`（缺字段时的元信息兜底）、`VideoCompressor.kt`（两遍压缩执行层）、`VideoPreviewView.kt`（系统播放器预览）+ `MediaKindsTest.kt`、`CompressPolicyTest.kt`；改 `AlbumPickerView.kt`（视频数据源 / 系统缩略图 / 时长角标 / 压缩勾选框与进度卡 / **后台裁决线程 + 拒绝提示**）、`MainActivity.kt`（媒体判定与权限分档、`maxBytes`、`VideoCompressor.clearCache()`）、`AndroidManifest.xml`（`READ_MEDIA_VIDEO`）、`app/build.gradle.kts`（依赖 + **`smart-exception-java` 手补** + `FFMPEG_ENABLED` + `abiFilters`）。
- 验证：`gradlew :app:testDebugUnitTest` **65 通过 / 0 失败**（较改造前 37 条，新增 MediaKinds 6 + CompressPolicy 22）；`gradlew :app:assembleDebug` / `:app:assembleRelease "-PgvAbi=arm64-v8a"` 均 **BUILD SUCCESSFUL**（release 206.6 MB），APK 里 `lib/x86_64/`（debug）/ `lib/arm64-v8a/`（release）含 `libavcodec.so` 等 ffmpeg 库且 `libavcodec.so` 内可搜到 `libx264`；`BuildConfig.FFMPEG_ENABLED=true`。ffmpeg 的 Java API 形状全部 `javap` 实读确认（P-181）。
- **设备实测（2026-10-11，模拟器 x86_64，两条 H.265/HEVC + AAC 的屏录）**：
  1. **导入相册**：`adb push` 之后相册里只看到 3 张旧图（MediaStore 是 pending 行）→ `content call … scan_volume` 提交后变成 44 图 + 3 视频，时长角标也出来了（P-184）。
  2. **42 分钟 / 226MB 的 mkv**（勾选框开和关各验一次）→ `压缩裁决：… → 拒绝：这段视频 42:01 超过 30 分钟上限：请先剪短再发`，**进程全程存活、没有启动 ffmpeg**（用户口径的"点压缩就闪退"由此消除）。
  3. **34 秒 / 2.2MB 的 mkv**（容器不在白名单 → 要压）→ `要压（长边 720）` → `开始压缩：2293457 字节` → **12 秒**后 `文件选择完成：1 个`；产物 `compress-1791691319210-pass1.mp4` **2029529 字节 / `video/mp4`**，页面确认收到（截图核对）。
  4. **崩溃根因与修复**：第一次跑压缩时 App **进程直接死**，`logcat -b crash` 是 `NoClassDefFoundError: com/arthenica/smartexception/java/Exceptions`（维护版 AAR 的 POM 缺 `<dependencies>`）→ 手补 `com.arthenica:smart-exception-java:0.2.1` + 调用点 `catch (Throwable)` 后，同一条视频 12 秒压完（见 P-183）。
- **未做**：真机（arm64）实测。上面全部在模拟器上完成；真机包已按修复后的代码重出（`app-release.apk`，206.6 MB），装到你手机上再走一遍合图/发瞬间即可。

## 10. 2026-10-17 追修：首帧预览 + 自绘播放器

- 新增 `components/moment/MomentVideoPlayer.tsx`，一个组件覆盖首页瞬间卡、首页瞬间瀑布、`/moments` 九宫格：
  - **首帧**：`preload="metadata"` + `src="#t=0.1"` + `loadedmetadata` 时 seek；`loadeddata`/`seeked` 后淡入。加载前铺渐变 + ▶，不再出现纯黑块。
  - **播放器**：`controls` 关闭；仅播放/暂停、进度条、音量/静音；portal 到 `document.body`，Esc / 背景点击 / 右上角关闭，关闭即暂停并恢复滚动。
  - **手机**：所有按钮 44×44，滑杆触控高度 44；面板宽度 `min(960px, 100%)`，视频高度上限 `58dvh`。
- 真浏览器验收（临时库 + 本地 MP4）：首帧 `readyState=4`、`videoWidth=960`、`currentTime=0.1`；自绘播放器 `controls=false`、播放/暂停与 seek/volume 均生效；桌面按钮 44×44、面板 960×693；390×844 手机面板 374×411、全部触控目标 ≥44；封面焦点首页 `10% 90%` / Banner `20% 80%` 保存后刷新仍一致。

## 11. 2026-10-17c 追修：手机竖屏视频全屏

- **竖屏判定**：`MomentVideoPlayer` 先用媒体项已有 `width/height` 初始化 `data-portrait`，`loadedmetadata` 再用浏览器解出的 `videoWidth/videoHeight` 校正；缺宽高时先按横屏卡片渲染，拿到元信息后切换。
- **手机竖屏布局**：`@media (max-width: 640px)` 下，`[data-portrait="true"]` 的播放层铺满 `100dvh`，去掉圆角/边框，视频按 `max-width/max-height: 100%` 等比装进舞台（`object-fit: contain`）。横屏继续沿用原来的居中卡片与 `58dvh` 上限。
- **全屏按钮**：播放器右上角新增「全屏 / 退出全屏」。优先对播放层调 `requestFullscreen()`（保留自绘控件），失败或浏览器没有 API 时退化为 `data-expanded="true"` 的视口铺满；真全屏与兜底布局都补了安全区 padding。
- **轻量 dev 核对**（用户口径：不逐帧截图）：临时库 + 390×844 移动视口 + 360×640 竖屏 MP4，点开播放层后：
  - 面板 `390×844`（铺满视口），舞台 `390×644`，视频 `360×640`（完整装进舞台，不裁切）；
  - 所有按钮/滑杆最小高度 `44px`，`readyState=4`；
  - 点「全屏」后 `document.fullscreenElement` 为真、按钮变「退出全屏」；
  - 关闭后浮层节点归零；页面无运行时异常。
- 临时视频/数据库/隔离 dev 目录只用于本次核对，核对后已清理；真实用户库未写入。
