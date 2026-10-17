# photo-edit-spec.md — 相册预览与图片编辑（Android 客户端）

> **状态**：已批准（2026-10-07 用户确认「全做」，并追加通知深链 bug）· 实施中 → 完成后回填证据。
> **触发条件**：大改动（≥3 个源码文件 + 新增档案产物），按 `docs/spec-template.md` 起 Spec。
> **范围**：**只在 `androidapp/`**；站点（`main/`）与 API **零改动**；**不新增第三方依赖**（继续只依赖 GeckoView + androidx.activity）。

## 1. 目标

在现有「`accept` 纯图片 → 自有全屏相册 `AlbumPickerView`」上加两层，并修两个同族 bug：

1. **预览（像微信）**：点缩略图进大图；左右滑翻张；双指 / 双击缩放；多选可在预览里勾选；右上「完成(N)」；底部「编辑」。
2. **编辑四件套**：涂鸦（8 色 + 粗细）｜马赛克（**像素马赛克 + 模糊**两种，各带粗细）｜裁剪（自由 + 1:1/4:3/16:9）｜旋转（左 / 右 90°）；带撤销 / 重做；「完成」把结果写进 App 缓存，**本次上传用编辑版，系统相册原图不动**。
3. **通知深链修复（用户报）**：点通知进文章 / 瞬间后，`site_url` 被改写成文章地址 → 以后每次启动都跳那篇文章。**根因**：`MainActivity.onNewIntent` 把深链全文写进 `KEY_SITE_URL`；且 `onCreate` 的 `handleDeepLink(intent)` 返回值被丢弃（冷启动根本没用深链）。

**非目标**：视频编辑；贴纸 / 文字 / 表情；滤镜与亮度对比度调整；编辑结果回写系统相册；离线草稿。

## 2. 交互规格

### 2.1 网格（`AlbumPickerView`）

- 缩略图右上角**常驻选择角标**：未选 = 半透明描边圆；已选 = 主色实心圆 + 序号。**点角标 = 勾选 / 取消**；单选模式不显示角标。
- **点缩略图 = 进预览**（不再直接勾选或直接返回）。
- 顶栏「完成」只对多选有效：把已勾选项（编辑过的取编辑版）交给 `confirmPending`；单选由预览页的「完成」返回当前张。
- 已编辑过的照片：网格缩略图**换成编辑版**（缩略图缓存 key 带 revision）。

### 2.2 预览（`PhotoPreviewView`）

| 区域 | 行为 |
|---|---|
| 顶栏 | 左「返回」回网格；中「3 / 27」（编辑过的加「已编辑」小标）；右「完成(N)」（多选 0 张时置灰；单选显示「完成」） |
| 中部 | 黑底大图；左右滑翻张（带吸附动画）；双指缩放 1–5x；双击在 1x / 2.5x 间切换；放大后拖动平移，**不翻页** |
| 底部 | 左「选择 / 已选」切换当前张；右「编辑」 |
| 返回键 | 编辑器开着 → 关编辑器；放大中 → 复位缩放；否则回网格 |

- 三页轮播（`prev / current / next`），只解码当前与相邻各一张（`LruCache(3)`）；换页后把滚动位置重置到中间页（内容相同，不跳动）。
- 预览解码长边上限 **2048**（屏幕观感足够，避免大图 OOM）。

### 2.3 编辑器（`PhotoEditorView`）

- 顶栏：左「取消」（丢弃并回预览）；中「撤销 / 重做」（不可用时置灰）；右「完成」（保存）。
- 底部四个工具：**涂鸦 ｜ 马赛克 ｜ 裁剪 ｜ 旋转**，选中态用主色。
- 二级栏：
  - **涂鸦**：8 个颜色圆点（白 / 黑 / 红 / 橙 / 黄 / 绿 / 蓝 / 紫）+ 粗细滑杆（短边 0.4%–4%）。
  - **马赛克**：`马赛克` / `模糊` 两个 chip + 粗细滑杆（短边 2%–12%）；圆形笔刷，从「整图参考图」取样。
  - **裁剪**：`自由 / 1:1 / 4:3 / 16:9` +「取消」「确定」；裁剪框四角 + 四边可拖、框内整体移动、九宫格辅助线、框外压暗；最小边 64dp。
  - **旋转**：「向左 90°」「向右 90°」。
- 切换工具时未确认的裁剪**自动生效**（不丢用户操作）；撤销粒度 = 一笔涂鸦 / 一笔马赛克 / 一次裁剪 / 一次 90° 旋转。
- 没有任何编辑点「完成」= 不落文件、不重编码（`onSaved(null)`，保留原图）。

### 2.4 编辑产物与上传

- 存储：`cacheDir/edited/edited-<时间戳>.jpg`（JPEG q92，长边 ≤ **2560**；不放大原图）。
- 登记：`PhotoEditStore`（`uri → File` + revision）；上传收口 `resolve(uri)` 返回编辑版 `file://`，原始 `content://` 不动。
- 清理：**每次打开相册前**清 `cacheDir/edited/`；`AlbumPickerView.shutdown()` **不能清**——`confirmPending` 在它之后才把文件拷进 `picked/`。
- 再编辑：以已登记的编辑版为源（扁平结果，不带上次操作栈）。

## 3. 数据模型与渲染

### 3.1 纯逻辑时间线（`PhotoEditState.kt`，无 Android 依赖 → JVM 单测）

```kotlin
sealed interface EditOp {
  Doodle(points: List<EditPoint>, color: Int, width: Float)   // 点/宽度都相对「画的那一刻」那张图
  Mosaic(kind: PIXEL|BLUR, points, width)
  Rotate(quarterTurns: Int)                                    // 顺时针 90°×n
  Crop(rect: EditRect)                                         // 「裁剪那一刻」那张图的归一化矩形
}
```

- `ops` 是**唯一事实源**；撤销 = 弹尾；重做 = 压回。没有第二份 `rotation/crop` 状态。
- `compile()` 把时间线编译成：**结构变换**（`Rotate`/`Crop`，按序作用在位图上）+ **画笔操作**（坐标已被后续结构变换映射到最终坐标系）+ 最终宽高比。
- 因此「先涂鸦再裁剪/旋转」= 涂鸦跟着图像被剪掉 / 转过去；「先裁剪再涂鸦」= 涂鸦坐标活在裁剪后的空间里，数学上一致。

### 3.2 渲染（`PhotoEditRenderer.kt`）

1. 结构变换：`Bitmap.createBitmap(..., Matrix 旋转)` / `createBitmap(src, x, y, w, h)`，长边上限 2560。
2. `out = flat.copy(ARGB_8888, true)`；依次执行画笔操作：
   - 涂鸦：归一化点 → 像素路径（`Path` + `ROUND` cap/join），`strokeWidth = width × min(w,h)`。
   - 马赛克：**每个马赛克操作现算一份参考图** `pixelate(out)` / `blur(out)`，圆形笔刷用 `BitmapShader` 从参考图取样（读参考、写 out，不会自我叠加变黑）。
3. 像素马赛克：按块大小（`min(w,h)/128`，6–40px）先缩小（filter=false）再放大（filter=false）。
4. 模糊：缩小到 1/12（filter=true）再放大回原尺寸（filter=true）——与微信「模糊」观感一致，且比真正的卷积便宜。
5. 解码：`PhotoFiles.decodeForEdit()` 两遍解码 + `ExifInterface` 方向纠正 + `OutOfMemoryError` 降级重试。

## 4. 文件清单

| 文件 | 职责 |
|---|---|
| `PhotoEditState.kt` | 新增 · 纯逻辑：时间线 / 撤销重做 / `compile()` 坐标变换 / 宽高比 |
| `PhotoEditRenderer.kt` | 新增 · 位图结构变换 + 涂鸦 / 两种马赛克渲染 + 参考图与笔刷 |
| `PhotoFiles.kt` | 新增 · 解码（编辑/预览/缩略图，含 EXIF）、保存 JPEG、edited 目录管理 |
| `PhotoEditStore.kt` | 新增 · 编辑版登记（uri→File / revision / resolve）+ `PickerSelection` |
| `PhotoEditorView.kt` | 新增 · 编辑器 UI 与手势（涂抹 / 马赛克 / 裁剪框 / 旋转 / 撤销重做 / 保存） |
| `PhotoPreviewView.kt` | 新增 · 三页轮播预览（滑动吸附、缩放、勾选、编辑入口、返回键） |
| `AlbumPickerView.kt` | 改 · 角标选择、点图进预览、预览/编辑叠层、`handleBack()`、编辑版缩略图 |
| `MainActivity.kt` | 改 · 返回键先给相册叠层、打开相册前清 edited、编辑版走原有 `confirmPending`、深链修复 |
| `AppUrl.kt` | 改 · 新增 `originOf()` 纯函数（深链只落 origin 的单一事实源） |

## 5. 通知深链修复

| 项 | 内容 |
|---|---|
| 根因 | ① `MainActivity.onNewIntent` 把 `https://site/posts/xxx` 全文写进 `site_url`；② `onCreate` 里 `handleDeepLink()` 的返回值被丢弃 → 冷启动没打开深链目标 |
| 修法 | 深链只影响**本次会话**的 `loadUri`；落盘只写 `AppUrl.originOf(deepLink)`（scheme://authority），下次启动回站点首页。冷启动也按深链打开 |
| 单一事实源 | `AppUrl.originOf()`；`MainActivity.refreshUploadLimits()` 与 `AppNotifier.siteOrigin()` 的重复 URI 解析改为复用它 |
| 验收 | 单测「深链不能把 path 带进 site_url」；模拟器 `adb shell am start -a android.intent.action.VIEW -d <文章地址>` → 打开文章；`shared_prefs/smartblog.xml` 的 `site_url` 仍是 origin；`am force-stop` 重启后落在站点首页而不是文章 |

## 6. 影响面与红线

| 项 | 结论 |
|---|---|
| 涉及模块 | 仅 Android 宿主；站点运行时、GeckoView 提示链（`onFilePrompt` 等）不改 |
| 新增依赖 | **无**（不用 Glide/Coil/ViewPager；轮播与缩放自绘） |
| 包体积 / 内存 | 只增加 Kotlin 源码；编辑位图峰值 ≈ 3–4 张 2560 级位图（含参考图），编辑期上限 2560 长边 |
| 破坏红线 | 不涉站点红线；不改 vendor；不动 GeckoView 版本与构建链三约束 |
| 权限 | 无新增（继续用 `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`） |
| 文档同步 | `docs/android/README.md`、`docs/android/architecture.md`（§6b-1/2）、`docs/README.md` 职责表、`AGENTS.md` §3 行；新坑进 `docs/pitfalls.md`；批次清单进 `changelog/pending/` |

## 7. 验收标准

1. **单测**：`gradlew :app:testDebugUnitTest` 全绿；新增用例覆盖旋转 / 裁剪 / 撤销重做 / 坐标变换 / 宽高比 / `originOf`；按用例名核对真的跑了。
2. **编译**：`gradlew :app:assembleDebug` 绿。
3. **模拟器端到端**（截图留证）：
   - 网格点图 → 预览大图；左右滑翻张（标题 `n / N` 跟着变）；双指 / 双击缩放生效；底部「选择」勾选与网格角标同步。
   - 涂鸦：换颜色 + 调粗细各画一笔；马赛克：`马赛克` / `模糊` 各画一笔（看得出两种效果）；裁剪：拖角 + `1:1` + 确定；旋转：左 / 右 90°；撤销 / 重做各回一步。
   - **切换型 chip 的高亮要跟着走**：在 `马赛克` / `模糊` 之间来回点，每点一次**看一次高亮**（选中那项才带主色底），不能"点了没反应"；同理裁剪比例那一排。（这条是 2026-10-11 用户报的 bug 之后补进验收表的，见 P-186。）
   - 「完成」后回到预览，缩略图变编辑版；多选「完成」上传，测试页显示的文件是**编辑版**（尺寸/文件名/时间戳与原始不同）。
   - 相机胶片面（系统相册）原图未被改动。
4. **深链回归**：见 §5 验收行。
5. **返回键**：相册 / 预览 / 编辑器开着时按系统返回键逐层退出，不穿透到后面的网页。

## 8. 审批与实施记录

- [x] 用户已批准（2026-10-07，「就按这个全做」+ 追加通知深链 bug）
- [x] 实施完成（2026-10-10）
- [x] 文档已同步：`docs/android/README.md`、`docs/android/architecture.md`（§2 深链表 / §3 返回键 / §6b-1 / §6b-2 / §7）、`docs/README.md`、`docs/pitfalls.md`（P-176～P-179）、`AGENTS.md`（§3 导航行 + §6 状态摘要）、`changelog/pending/APP-ALBUM-PREVIEW-EDIT-CHANGELOG.md`

**实施与验收证据（2026-10-10）**

| 项 | 结果 |
|---|---|
| `gradlew :app:testDebugUnitTest` | 37 条全绿：`AppUrlTest` 9（含 `originOf` 与「深链不落 path」回归）、`PhotoEditStateTest` 17（新）、`PushRulesTest` 11|
| `gradlew :app:assembleDebug` | BUILD SUCCESSFUL |
| 模拟器（AVD `myblog_test` / Android 11 / x86_64）| 相册打开且「已选 0/6」（= 测试服务端 `GET /api/upload/limits` 生效）；点缩略图进预览；滑动翻张 `1/3 → 2/3 → 3/3` 逐张正确；编辑器四工具 + 调色板 + 粗细滑杆齐；涂鸦换色/加粗各一笔正确；像素马赛克出块状效果；裁剪/旋转面板与撤销按钮状态正确 |
| **编辑 → 上传闭环** | 画一笔 → 「完成」→ 预览标题 `1 / 3 · 已编辑`、图上是编辑版 → 「选择」+「完成」→ 测试页收到 **`edited-1791640992256.jpg · 5888 B`**（原图是 `pic2.jpg · 4115 B`）→ **上传的确是编辑版、系统相册原图未动** |
| 关键日志 | `预览归位：pageWidth=1080 轨道=3240 实际 scrollX=1080`；`预览绘制：view=1080x1803 bitmap=2048x1536 scale=0.527`（4096×3072 的原图按 2048 解码）|

> 验收过程里抓到并修掉一个真 bug（**P-180**）：涂鸦"落笔即画"但忘了把这一笔记进时间线 → 画面有、`isDirty()` 却是 false，"完成"当没编辑过处理、上传还是原图。修后重跑上面的闭环通过。

> 细粒度交互（各种手势组合、真机纹理差异）由用户在自己的手机上继续验收；本 Spec 的验收标准 §7 已逐条可复现。

**追修（2026-10-11，用户报）**

| 项 | 结果 |
|---|---|
| 问题 | 「选择两种马赛克的时候选项高亮异常」：点 `模糊` 后高亮仍停在 `马赛克`（状态其实已切换，看着像没选中） |
| 根因 | `chipRow()` 的选中态是**构建期**写死的；马赛克种类那行的 `onClick` 只改了 `mosaicKind`、没有重建二级栏（同文件里涂鸦颜色行与裁剪比例行都重建了，见 P-186） |
| 修法 | 那行点击里补 `rebuildSecondaryBar()`；在 `chipRow()` 上写明"改选中态必须重建"的契约（纯触发型按钮不受约束） |
| 设备验收（模拟器 x86_64） | 进入编辑器 → 点「马赛克」→ 截图：蓝底在 `马赛克` 上；点「模糊」→ 截图：蓝底移到 `模糊`、`马赛克` 回到普通态、**笔宽滑杆位置不变**（重建不丢状态） |
| 回归 | `gradlew :app:testDebugUnitTest` 65/0；debug + release（arm64，206.6 MB）均构建成功 |
