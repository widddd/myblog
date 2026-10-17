# architecture.md — 宿主结构与交互约定

> 宿主实现分布在 `androidapp/app/src/main/java/com/smartblog/app/`：`MainActivity.kt`（会话/地址表单/返回键/开屏/上传上限/**通知开关入口**/**深链只落 origin**）、`AppUrl.kt`（**站点地址与客户端标识的唯一事实源**：默认地址、历史默认值迁移、地址归一化、`originOf()`、UA 标记 —— 纯逻辑，有 JVM 单测）、`PushRules.kt` / `PushSettings.kt` / `AppNotifier.kt` / `NotifyAlarmReceiver.kt`（**消息提醒**：增量解析与管理员态判定、状态存储、前台轮询与后台巡检、唤醒接收器 —— 见 §10）、`HostUi.kt`（**统一视觉语言**：色板、圆角、字号、按钮、弹层外壳）、`PickerViews.kt`（下拉框/月历/时间三块卡片式选择器）、`FormPrompts.kt`（prompt → 选择器 → 回填的流程，§6c）、`AlbumPickerView.kt`（自有相册，§6b-1）、`PhotoPreviewView.kt`（预览，§6b-2）、`PhotoEditorView.kt`（编辑器，§6b-2）、`PhotoEditState.kt`（**编辑时间线纯逻辑**，有 JVM 单测）、`PhotoEditRenderer.kt`（位图渲染）、`PhotoFiles.kt`（解码/保存/EXIF）、`PhotoEditStore.kt`（编辑版登记 + 选择集）、`VoiceRecorderView.kt` / `AudioRecorder.kt` / `AudioTrimmer.kt` / `VoiceRecorderPolicy.kt`（**语音瞬间的原生录音小窗**，§6b-4）、`PickedFileName.kt`（**相册/文件选择器临时文件名收口**：超长/非法字符压到 80 并保留扩展名，配 JVM 单测）。
> 刻意不引 AppCompat / Material / Compose：界面用原生控件在代码里搭，依赖面只有 GeckoView + androidx.activity。**不引依赖不代表用系统默认样式**——所有界面元素（含弹层）都走 `HostUi` 那一份取值。相册预览/编辑也**不引第三方图片库**（轮播、缩放、马赛克、裁剪全部自绘）。

## 1. 视图分层

```
FrameLayout(container)          ← res/layout/activity_main.xml，只是占位
  ├─ GeckoView                  ← 懒创建：第一次真正要加载页面时才建
  ├─ 浮动入口（TextView 画成圆）  ← 右下角，42dp，半透明
  └─ 地址表单（View）            ← **只在「修改网站地址」时**挂上去，压在最上层
```

会话（`GeckoSession`）与视图一起懒创建（`ensureSession()`），所以「还没填地址」的首次启动不会白白拉起 Gecko 内核。

## 2. 站点地址：默认直达生产域名，用户改过的算用户数据

用户决策（2026-10-03）：**首次启动不再进「请输入网站地址」页面**，直接进默认站点；地址仍可从右下角 ⋮ 改。规则全部落在 `AppUrl.kt`（纯逻辑 + `app/src/test/.../AppUrlTest.kt`，`gradlew :app:testDebugUnitTest` 就能跑，不需要模拟器）。

| | |
|---|---|
| 默认地址 | `AppUrl.DEFAULT_SITE_URL` = **`https://bruccese.com`**（生产域名，必须 HTTPS：生产 cookie 带 `Secure`，明文 HTTP 下会话 cookie 不回传，见 P-116） |
| 存储在 | `SharedPreferences("smartblog")` → `site_url`，**只是用户自定义覆盖**：没有它就用默认地址 |
| `BuildConfig.START_URL`（`-PstartUrl=` 注入） | 构建期覆盖手段：模拟器开发用 `-PstartUrl=http://10.0.2.2:3000`；缺省就是 `https://bruccese.com`；**传空串会退回默认地址**（不会再进地址表单） |
| 首启判定 | 一律直接加载 —— 没有「必须填一次」的路径了 |
| **历史默认值迁移** | 已存地址若命中 `AppUrl.LEGACY_DEFAULT_URLS`（首版默认 `http://10.0.2.2:3000`）→ 一次性重写成当前默认。**依据**：这些值是构建期注入的初值，用户不可能手敲出来，命中即说明没被改过；用户自己填过的地址（哪怕只差一个端口）**一律不动** |
| 复现首启 | `adb shell pm clear com.smartblog.app` |
| 修改入口 | 右下角浮动 ⋮ → 「修改网站地址」（表单预填当前地址，可取消） |

地址归一化（`AppUrl.normalize()`）：没写协议按 **`https://`** 补（用户手敲域名时最可能漏协议，补 http 会让他在第一次访问就丢登录态）；只接受 `http`/`https` 且必须有主机名；末尾斜杠去掉；**别的协议（`ftp://` 等）直接判非法**——不回退成"补协议"（否则 `ftp://x` 会静默变成合法的 `https://ftp://x`）；非法输入在表单内原地报错、**不落盘**。

**通知深链（`ACTION_VIEW`，点通知进文章/瞬间）只影响本次会话，不污染 `site_url`**：

| 事项 | 做法 |
|---|---|
| 落盘 | 只写 `AppUrl.originOf(deepLink)`（`scheme://host[:port]`，小写、去默认端口），**绝不写整条文章地址** |
| 本次会话 | `loadUri(深链地址)` —— 该进哪篇文章就进哪篇 |
| 冷启动 | `onCreate` 里 `handleDeepLink(intent)` 的结果要**真的用起来**（以前返回值被丢掉，冷启动点通知等于没点） |
| 下次启动 | 回站点首页（`site_url` 是 origin），不会"永远停在那篇文章" |
| 复用 | `MainActivity.refreshUploadLimits()` 与 `AppNotifier.siteOrigin()` 都走 `AppUrl.originOf()`（单一事实源，别各写一份 URI 解析） |

⚠️ 这是**用户报过的 bug**（2026-10-07）：热启动把 `https://site/posts/xxx` 整条写进了 `site_url`，之后每次启动都进那篇文章。回归口径见 [photo-edit-spec.md](photo-edit-spec.md) §5。

## 2b. App 身份：UA 自报家门（`SmartBlog/<版本>`）

宿主在**建会话时**（`ensureSession()`）把 UA 设成 `<内核默认 UA> SmartBlog/<版本>`：

| 事项 | 做法 |
|---|---|
| 取值 | `GeckoSession.getDefaultUserAgent()`（**静态**方法）。⚠️ 实例上的 `getUserAgent()` 是另一个东西：它返回 `GeckoResult<String>`，异步查内核，别当字符串用（踩过：编译期 `Unresolved reference`） |
| 设置方式 | `GeckoSessionSettings.Builder().userAgentOverride(AppUrl.withSmartBlogTag(...))` —— 必须在 `open()` 之前，否则网络栈拿到的还是默认 UA |
| 为什么追加而不是替换 | 保留内核默认 UA 的前半段，站点侧任何按 UA 判形态的地方都不吃亏（追加式是 WebView 类客户端的通行做法） |
| 幂等 | `withSmartBlogTag()` 见到已有标记就不重复追加 |
| 站点侧判定 | `main/src/lib/client/detect.ts` 的 `isSmartBlogApp()`（服务端读请求头 UA）；两边的标记字面量必须一致 |
| 当前用途 | 首页在 App 里**不渲染「推荐应用」卡片**（`isModuleHidden()`，`HomeModuleRenderer.tsx` / `HomeGrid` / `HomeFloat` 三处同一判定；只在内层 `return null` 会留下空格子，浮层还会留一个贴边空 `<aside>` 压住点击）；将来的推送抑制也用这个标记 |

**实测证据（2026-10-03，模拟器 x86_64 / Android 11，debug 包 `-PstartUrl=http://10.0.2.2:3011/probe`）**——用一个只回显 `user-agent` 的临时 Node 服务当靶子：

```
[ua-probe] GET /api/upload/limits                  ← 宿主自己的 HttpURLConnection
[ua-probe] user-agent: Dalvik/2.1.0 (Linux; U; Android 11; sdk_gphone_x86_64 Build/RSR1...)   ← 原样，未受影响
[ua-probe] GET /probe                              ← GeckoView 内核发起的页面请求
[ua-probe] user-agent: Mozilla/5.0 (Android 11; Mobile; rv:157.0) Gecko/157.0 Firefox/157.0 SmartBlog/0.1.2
```

即：**`userAgentOverride` 真的落在网络层**（不是只改了页面里的 `navigator.userAgent`），且宿主自己的 Java 请求不受影响。同轮 logcat：`I SmartBlog: 进入站点：http://10.0.2.2:3011/probe`（说明 `site_url` 生效、**没有**弹地址表单）、`I SmartBlog: 会话 UA：… SmartBlog/0.1.2`。

## 3. 返回键语义（页面自己没有地址栏，必须在这里兜住）

| 当前状态 | 返回键 |
|---|---|
| 相册（含预览 / 编辑器叠层） | **先逐层退**：编辑器 → 预览 → 关闭相册（`AlbumPickerView.handleBack()`，`MainActivity` 的返回回调第一分支）。编辑器里裁剪框还没确认时，先取消裁剪框 |
| 预览里放大过 | 先复位缩放，再退到网格 |
| 「修改」模式的地址表单 | 取消，回到网页（首启不再有表单，这个分支是唯一入口） |
| 网页 | 能后退就后退，否则退出（`canGoBack` 来自 `NavigationDelegate.onCanGoBack`，`GeckoSession` 上没有这个查询方法） |

## 4. 深浅色跟随系统

- 清单里 `android:configChanges` 含 `uiMode` → Activity **不会重建** → 必须自己实现 `onConfigurationChanged()` 重画表单。
- 重画时把用户**已经敲进去的内容带回去**（`showSiteForm(preset = ...)`），否则切主题会吞掉输入。
- 黑/白两套色值集中在 `HostUi.kt` 的 `hostPalette()`（**单一事实源**）：地址表单、开屏、自有相册、下拉框/日期时间弹层都从那一份取值；站点页面本身用站点自己的配色，宿主不干预。

## 4b. 表单**不自动弹键盘**

表单根视图自己拿住焦点（`isFocusableInTouchMode = true` + `requestFocus()`），输入框不自动获焦。
理由：地址通常是预填好的，用户第一动作是点「确认」；自动弹键盘等于逼他先关键盘。要输入时点一下输入框即可。

## 5. 浮动入口的位置取舍（用实测数字定的，不是眼估）

后台的手机形态有一条固定底栏，**这是唯一的占位约束**（站点前台右下角没有任何 fixed 元素：`globals.css` 里 `position: fixed` 只有顶栏、抽屉、灯箱，全在顶部或全屏）。

实测（模拟器 1080×2280 / density 420 / GeckoView `devicePixelRatio` 2.6087）：

| 量 | 值 | 来源 |
|---|---|---|
| `--admin-tabbar-h` | 56 px | `admin.css` |
| `env(safe-area-inset-bottom)` | **0** | 测量页实测（不是猜的：GeckoView 不会把系统导航栏算进安全区） |
| → 底栏实际高度 | 56 CSS px = 146 设备 px = **55.7 dp** | 换算 |
| 按钮底边距窗口底 | **68 dp** = 179 设备 px（实拍量的包围盒） | 42dp 圆、右距 12dp、alpha 0.55 |
| → 与底栏的间隙 | **12.5 dp** | 相减 |

所以 `bottomMargin = dp(68)` 的含义是「56 底栏 + 12 间隙」：尽量贴下，又不压到底栏。
**改这个值时先确认 `--admin-tabbar-h` 有没有变**，别看着顺眼就调。

菜单三项：

| 项 | 行为 |
|---|---|
| **返回上一页** | `GeckoSession.goBack()` —— **网页历史回退**（等同浏览器后退键），不是退出 App。没有历史时**置灰**而不是隐藏（隐藏会让人以为功能不存在）；启用状态来自 `NavigationDelegate.onCanGoBack` |
| **刷新** | `GeckoSession.reload()` |
| **修改网站地址** | 打开地址表单（可取消） |

> 注：底部系统返回键与「返回上一页」走同一套 `canGoBack`，两条路语义一致。

## 6. 明文 HTTP

明文访问弹一次警告（每个进程一次），**判定看 URL 协议**：

- 早先判定用的 `NetworkSecurityPolicy.isCleartextTrafficPermitted(url)`，理由是"语义由系统说了算、不维护地址表"。但**宿主后来自己也要发 http 请求**（取上传上限，见 §9），那类请求走 Android 网络栈、受明文策略管：报 `java.io.IOException: Cleartext HTTP traffic to 10.0.2.2 not permitted`。于是清单里开了 `android:usesCleartextTraffic="true"` —— 那个 API 从此**永远返回 true**，再拿它判定等于把警告悄悄关掉。改成"`http://` 开头就警告"，同样不维护地址表。
- GeckoView 自带内核、走自己的网络栈，本来就不受这个开关影响：开它**不会让网页侧更不安全**，只是让宿主那一个请求能发出去。
- 生产必须 HTTPS，否则 session cookie 不回传（见 [build.md](build.md) §7）。

## 6b. 文件上传：`<input type="file">` 必须由宿主接管

**不接管 = 页面永远等在那儿。** 站点的所有上传入口（插入图片/视频/音频、瞬间配图、媒体库工具栏、导入 Markdown、导入更新包/备份）都是 `<input type="file">`；GeckoView 把它变成 `PromptDelegate.onFilePrompt` 交给 App，没实现时系统选择器不出现、`change` 事件永不触发——用户看到的就是「点了上传没反应」。

| 事项 | 做法 |
|---|---|
| 提示类型 | `FilePrompt.Type.SINGLE=1 / MULTIPLE=2 / FOLDER=3`。**常量在 `FilePrompt.Type` 上**，`FilePrompt` 本体只有 `type` / `mimeTypes` / `capture` 三个字段（javap 实测；`PromptDelegate` 接口上已经没有这些常量了，别照着老文章写）。⚠️ **`capture` 是 `int` 字段、不是 `String`，AAR 里也没有 `CAPTURE_*` 常量** —— 只判"非 0 = 页面带了这个属性"（P-187） |
| **图片/视频走自有相册** | `accept` 全是 `image/*`、全是 `video/*`、或**只有这两类混着**（无 `audio`、无扩展名映射）→ 弹自有全屏相册 `AlbumPickerView`；带音频或任意文件的混合（例如媒体库的「文件视图」`MEDIA_ACCEPT`、导入 Markdown/更新包）→ 系统选择器，行为完全不变。判定是**纯逻辑** `MediaKinds.kt` 的 `albumMediaForTypes()`（JVM 单测），不要在 `MainActivity` 里手写 `startsWith("image/")` —— 判错是静默的（该接管不接管 = 视频不压缩；不该接管却接管 = 音频选不到） |
| **录音走原生界面（2026-10）** | 站点在 App 模式下给发布区的麦克风按钮挂 `accept="audio/x-smartblog-voice,audio/webm,audio/mp4,audio/ogg"` + `capture`；宿主 `MediaKinds.isVoiceRecordRequest(types, capture)` 命中就弹 **`VoiceRecorderView`**（原生小窗：实时波形 / 计时 / 停止后拖两端裁剪 + 试听），**不走相册、也不走系统选择器**。录完（或裁剪完）的文件经**同一条 `confirmPending()`** 回给页面，页面用现成上传链路入库 —— 宿主不碰 cookie、不自己上传。两个信号都认（标记 MIME 优先；`capture` 只在 accept **全是音频**时才算，免得别的输入框带 capture 就把录音器弹出来）；**纯 audio accept 不等于录音**：媒体库「文件视图」与编辑器「插入音频」都是 audio 类 accept，一律接管会让用户再也选不到现成音频文件（见 [moment-audio-spec.md](../moment-audio-spec.md) §2.5） |
| **能选几张** | 由**服务端**决定：后台 Setting `uploadMaxImagesPerBatch`（默认 9，设置页可改）→ `GET /api/upload/limits` 的 `maxImages`。单选输入（封面）单点即返回；多选输入显示「已选 n/9」。取不到就用兜底 9——**绝不能因为取不到就不让选图**。生效时机：后台同一个进程里一保存就立即生效（`setSetting()` 当场刷缓存）；`getSetting` 的 60s 进程内缓存只在值由别的进程写入时才咬合，而接口自带 `Cache-Control: public, max-age=300`，**中间有反代/CDN 缓存时最多可能 5 分钟旧值**——别把它当「改完立刻全世界生效」。**同一个 `maxBytes` 也决定最长能录多久**：`VoiceRecorderPolicy.maxRecordMs(uploadMaxBytes)` = min(5 分钟, 上限 ÷ 16KB/s)，站点上限调到 1MiB 时只让录 65 秒 |
| 相册权限 | 图片与视频**分开要**：Android 13+ 是 `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`（一次相册只请求本次 accept 允许的那几枚，走 `RequestMultiplePermissions`）；≤32 两枚都是 `READ_EXTERNAL_STORAGE`。用到的时刻才要；**拒绝就退回系统选择器**，绝不让用户传不了文件 |
| 录音权限 | `RECORD_AUDIO`（运行时）。点麦克风时才要；**拒绝就取消这一次请求**（`dismissPending()`，页面收到 dismiss 不会一直悬着，想试再点一次）。Manifest 里已声明；GeckoView 网页层的 `getUserMedia` 也要这枚 + `PermissionDelegate`，但**本项目的录音 UI 在原生侧**，所以网页层不需要它 |
| 选择器 | `ACTION_OPEN_DOCUMENT` + `CATEGORY_OPENABLE`，仅 MULTIPLE 时加 `EXTRA_ALLOW_MULTIPLE` |
| MIME 过滤 | 纯媒体 accept（`image/` `video/` `audio/`）→ 传 `EXTRA_MIME_TYPES`，选图时只列图片；其它（站点用扩展名写的 `.md` / `.tar.gz` → Gecko 映射成 `text/markdown`、`application/gzip`）→ **不过滤**，按 MIME 过滤会让用户在自己存储里找不到文件。见 `mediaFilters()` |
| 目录上传 | 站点没有这个入口，显式 `dismiss()` + 日志，不给半残的目录选择 |
| 生命周期 | `registerForActivityResult`；同一时刻只保留一个待决 prompt，重复触发先取消前一个 |

### 6b-1. 自有相册视图（`AlbumPickerView.kt`）

全屏覆盖层：顶栏「取消 / 已选 n/9（单选时是"选择一张照片 / 一段视频 / 照片或视频"）/ 完成」+ 三列网格；**允许视频时**第二行下面再多一行「自动压缩视频」（见 §6b-3）。

- 数据源按 `MediaKinds.kt` 的 `kinds` 决定：图片查 `MediaStore.Images`、视频查 `MediaStore.Video`（多取 `DURATION`/`SIZE`/`WIDTH`/`HEIGHT`/`BITRATE`），两路各自 `DATE_ADDED DESC`，**合并后整体重排**（刚拍的/刚录的都在最前）；两路查询**各自包 `runCatching`**（个别 ROM 的视频列会抛，不能因此连图片都看不到）。
- **相册集（bucket）**：一次查询把 `BUCKET_ID`/`BUCKET_DISPLAY_NAME` 一起取回来，在内存里分组。顶部第二行是当前相册名（可点），展开是「全部照片 (N) + 各相册集 (n)」，按**最近有照片**的排前面。切换只过滤已取到的列表——**不重新查库、不丢缩略图缓存**。
  - ⚠️ 那一行用 `FrameLayout` 而不是横向 `LinearLayout`：底部分隔线是 `MATCH_PARENT` 宽，放进横排会把相册名挤成 0 宽（现象是"只剩一条线、看不见相册名"）。
- **不引依赖**：网格用 `GridView` + `BaseAdapter`，缩略图自己两遍解码（先 `inJustDecodeBounds` 量尺寸，再按 `inSampleSize` 采样到 ~300px）+ `LruCache`（按张数计，最多 120）。**不要**为这个引 Glide/Coil。图片解码统一走 `PhotoFiles.decode()`（**带 EXIF 方向纠正**——以前不做，竖拍照片在网格里会躺倒）；**视频缩略图走系统**：API 29+ `ContentResolver.loadThumbnail(uri, Size(300,300))`，26–28 退回 `MediaStore.Video.Thumbnails.getThumbnail(..., MINI_KIND, null)`，拿不到就留一块深色底（不画假图）。视频格左下角另外挂一个时长角标（`m:ss` / `h:mm:ss`）。
- 视图复用要**比对 `image.tag`**（key = `uri#revision`）再贴 bitmap，否则快速滚动会串图。
- **选择靠角标**：每格右上角常驻一个圆（未选 = 半透明描边；已选 = 主色实心 + 序号），**点角标 = 勾选/取消**；到底上限时顶栏提示「最多选 N 张」而不是静默忽略。单选（封面）不显示角标。
- **点缩略图 = 进预览**（§6b-2，像微信），不再直接返回/直接勾选；**视频点开进 `VideoPreviewView`**（系统 `VideoView` + `MediaController` + 「返回 / 选择」；播不了也给一句提示并允许直接选原文件，不把用户困在那一页），图片仍进 `PhotoPreviewView`（传进去的是**过滤掉视频后的图片列表**，索引也按那个列表算）。顶栏「完成」在多选时把已勾选项（编辑过的取编辑版、需要的视频先压缩）交给 `confirmPending`。
- 收尾统一走 `confirmPending(uris)`——**和系统选择器同一条收口**，`content://` → `file://` 只在那一处做（编辑产物本来就是 `file://`，原样过）。

### 6b-2. 预览与编辑（`PhotoPreviewView.kt` / `PhotoEditorView.kt`）

用户要求：选照片时**像微信一样能预览 + 编辑**。**站点侧零改动**，全在宿主；**不引任何依赖**（轮播、缩放、马赛克、裁剪框都自绘）。

| 层 | 行为 |
|---|---|
| 预览 | 黑底大图；**左右滑翻张**（松手吸附到整页）；**双指缩放 1–5x**、**双击**在 1x/2.5x 间切换、放大后拖动平移（放大时不让外层翻页）；底部「选择 / 编辑」；顶栏「返回 / n / N（编辑过追加「已编辑」）/ 完成(N)」（多选 0 张时置灰） |
| 编辑器 | 顶栏「取消 / 撤销 重做 / 完成」；底部四工具 **涂鸦 ｜ 马赛克 ｜ 裁剪 ｜ 旋转**；涂鸦 = 8 色 + 粗细滑杆；马赛克 = **像素马赛克 / 模糊**两个 chip + 粗细滑杆；裁剪 = 自由 / 1:1 / 4:3 / 16:9 + 四角四边可拖 + 九宫格 + 框外压暗；旋转 = 左 / 右 90° |

分层与数据流：

```
PhotoEditState.kt      纯逻辑：EditOp 时间线（Doodle/Mosaic/Rotate/Crop）+ 撤销重做 + compile()（把后来的
                       旋转/裁剪映射到先前的画笔坐标上）+ 宽高比；无 android.*，JVM 单测（PhotoEditStateTest）
PhotoEditRenderer.kt   位图：结构变换（旋转/裁剪）→ 逐个画笔操作；涂鸦 = Path（中点二次贝塞尔，圆头圆角）；
                       马赛克 = 圆形笔刷从**参考图**取样（像素 = 按块缩小再放大；模糊 = 缩到 1/12 再放回）
PhotoFiles.kt          解码（两遍 + EXIF 方向 + OOM 降级）、保存 JPEG(q92)、edited/ 目录清理
PhotoEditStore.kt      编辑版登记（uri → File + revision）+ 网格/预览共用的 PickerSelection
PhotoEditorView.kt     编辑器 UI 与手势；落笔即画进当前位图（零延迟），撤销/旋转/裁剪才整张重渲染（后台线程）
PhotoPreviewView.kt    三页窗口轮播（prev/current/next，只解码当前与相邻）+ 缩放 + 勾选 + 编辑入口
```

- **编辑产物只进 App 缓存**：`cacheDir/edited/edited-<时间戳>.jpg`（长边 ≤ **2560**，JPEG q92，**不放大原图**）；系统相册原图一个字节都不动。上传时 `PhotoEditStore.resolve()` 给的是编辑版 `file://`。
- **清理时机**：**每次打开相册前** `PhotoFiles.clearEditedDir()`。**别放在 `shutdown()` 里** —— 点「完成」时 `closeAlbumPicker()`（→ `shutdown()`）先跑，`confirmPending()` 才把编辑版拷进 `picked/`，清早了会丢文件。
- **再编辑**：以已登记的编辑版为源（扁平结果，不带上次的操作栈）。
- 「没有编辑」点「完成」= `onSaved(null)`，不重编码、保留原图。
- 网格缩略图缓存 key 带 revision：编辑完成后网格那张立刻换成编辑版。
- 诊断日志（排查预览黑屏这类问题用）：`预览尺寸：W x H` / `预览归位：pageWidth 轨道 实际 scrollX` / `预览绘制：view=… bitmap=… scale=…`（每张位图一条）/ `预览解码失败`。

⚠️ 三个已经踩过的坑（详见 [../pitfalls.md](../pitfalls.md) **P-176 / P-178 / P-180**）：
三页子 View 的宽度要等**下一轮布局**才生效，`onSizeChanged` 里改完就当轮 `scrollTo` 会被夹回 0（预览黑屏）；
宿主配色字段**别叫** `background` / `foreground`（与 `View.getBackground()/getForeground()` 撞名，引用会解析成 `Drawable`）；
画笔「落笔即画」时**必须同时** `state.add(...)`，否则撤销回不去、"完成"还会判定成"没编辑过"（验收要查产物文件，别只看截图）。

### 6b-3. 视频压缩（`CompressPolicy.kt` / `VideoCompressor.kt`，2026-10）

用户口径：相册里一个「自动压缩视频」勾选框（默认开、可关）；码率 > 4 Mbps 或大小 > 50 MB 时自动压缩；用 ffmpeg（以后音频处理也走它）。**2026-10-11 追加两条硬约束（都来自真机验证）**：① **视频 > 30 分钟一律不许发**（产品规则，与站点同口径，跟勾选框无关）；② 压缩裁决「压不进去就别压」—— 拒绝时留在相册给一句人话，**绝不启动 ffmpeg 硬编**。

| 层 | 文件 | 内容 |
|---|---|---|
| 纯逻辑（JVM 单测） | `CompressPolicy.kt` | `VideoMeta` → `isTooLong()` / `shouldCompress()` / `decide()` / `plan()` / `planBySize()` / `scaleFilter()` / `ffmpegArgs()` / `requiredFreeBytes()`。阈值（>4Mbps / >50MB / 超站点上限 / **容器不在白名单** / **>30 分钟**）、目标参数（长边 ≤1920 且**不放大**、x264 `veryfast`、CRF 24、`-maxrate 4M -bufsize 8M`、AAC 128k、`+faststart`、`-threads 2`、`-map 0:v:0 -map 0:a:0?` 只留一路画面/声音并剥掉元信息）、「按体积反推码率的第二遍」（**码率取「目标反推」与「源码率」的较小值，压缩绝不把文件压大**）与 600 kbps 下限全在这里；配 `CompressPolicyTest` |
| 执行 | `VideoCompressor.kt` | 先查可用空间（不够就不开编），再把 `content://` 拷进 `cacheDir/compress-input/`（ffmpeg 只吃路径，也顺手与原文件解耦），再跑 `FFmpegKit.executeWithArgumentsAsync(String[], …)`（**参数数组**，不拼 shell；**外面包 `catch (Throwable)`**，见 P-183）；进度 = `Statistics.getTime() / 时长`；第一遍 CRF 仍超站点上限就按体积再压一遍（进度按 0–60 / 60–100 两段）；取消走 `FFmpegKit.cancel(sessionId)`；产物落 `cacheDir/compressed/compress-<ts>-passN.mp4` |
| 元信息兜底 | `MediaProbe.kt` | `fillMissing()`：**只在 MediaStore 缺字段时**才补（体积走 `AssetFileDescriptor.length`，时长/宽高/码率走 `MediaMetadataRetriever`）。字段齐了就一次 native 都不调 —— 大 H.265 文件上那一步最重（P-184） |
| 判定输入 | `MediaKinds.kt` | 这一路 accept 能不能选视频（不能选就不显示勾选框、也不压；**但 30 分钟规则照样生效**） |

### 6b-4. 原生录音（`VoiceRecorderView.kt` / `AudioRecorder.kt` / `AudioTrimmer.kt` / `VoiceRecorderPolicy.kt`，2026-10）

语音瞬间在 App 里**不弹网页那张卡片**，改由宿主弹自己的小窗（站点与宿主之间只加一个 accept 标记，见 §6b 的「录音走原生界面」行与 [moment-audio-spec.md](../moment-audio-spec.md) §2.5）。

| 事项 | 文件 | 做法 |
|---|---|---|
| 纯逻辑（JVM 单测） | `VoiceRecorderPolicy.kt` | `maxRecordMs(serverMaxBytes)` = min(5 分钟, 上限 ÷ 16KB/s)（128 kbps 单声道 ≈ 16 KB/s，站点上限调小也录得进去）、`amplitudeToLevel()`（`getMaxAmplitude()` 0..32767 → 0–100，开方曲线 + 静音地板）、`downSample()`（组内取最大，别用平均＝把语音尖峰抹平）、`trimRange()`（手柄位置 ↔ 毫秒、最小时长 1 秒、贴边夹取、**没有时长就没有区间**）、`isFullRange()`（整段没动就交原文件、不重封装）、`clockOf()`（与站点 `momentClock()` 同写法）；配 `VoiceRecorderPolicyTest` |
| 录制 | `AudioRecorder.kt` | `MediaRecorder`（`MIC` + `MPEG_4` + `AAC`，128 kbps / 44.1 kHz / **单声道**）→ `cacheDir/voice/voice-<ts>.m4a`；`stop()` 拿到 0 字节文件算失败并删残件（设备出错时 `stop()` 会抛，不能把坏文件交出去）；**取消/退出/Activity 销毁统一走 `cancel()` 的 `stop → reset → release` 无早退出口**（不能因为 `file == null` 就跳过释放，否则麦克风仍被占用）；**接线在 `MainActivity`**：`onFilePrompt` → `isVoiceRecordRequest()` → 要 `RECORD_AUDIO` → `showVoiceRecorder()`；`onPause` 立刻取消（不申请前台服务，后台录音不该发生）、`onDestroy` 兜底释放；每次打开前 `clearOutputDir()`（与相册/压缩同一时机） |
| 裁剪 | `AudioTrimmer.kt` | **`MediaExtractor` + `MediaMuxer`，不重编码、不引 ffmpeg**：`seekTo(startUs, SEEK_TO_PREVIOUS_SYNC)` 起读，丢掉早于起点的那一帧（保证 PTS 从 0 开始且单调），写到 `endUs` 为止；失败返回 null 并删半成品，**调用方兜底交原文件**（绝不交不能播的产物） |
| 界面 | `VoiceRecorderView.kt` | 自绘 `Dialog` 小窗：弹入动画（`translationY + alpha + scale`，`DecelerateInterpolator`，波形逐根长出来）→ 录制态（实时波形 / 计时 / 停止，`FLAG_KEEP_SCREEN_ON`）→ 停止后**不直接上传**：整段波形 + 两端可拖手柄（`onTouchEvent` 自己算比率）+ 试听（`MediaPlayer`，播到选区末尾自动停）+ 重录 / 取消 / 使用；「使用」时整段没动就交原文件，动了才调 `AudioTrimmer`；产物经 `confirmPending()` 回页面 |
| 格式选择 | — | App 录 **MPEG_4/AAC**（全平台可播，含 iOS Safari），不是 MP3：Android 的 `MediaRecorder` 没有 MP3 编码器，要 MP3 得换 ffmpeg 包或引 LAME 移植，代价不成比例（用户本轮已拍板"不强制 MP3"）。⚠️ 据此产出的 m4a 主品牌不是 `M4A `，上传时**必须**靠站点的容器复核（P-188） |

- **站点上限从哪来**：`GET /api/upload/limits` 的 `maxBytes`（后台 Setting `uploadMaxSizeMB`，默认 10MB），取不到用 `MainActivity.DEFAULT_MAX_BYTES`（10MB）兜底；**超过它也触发压缩** —— 否则传上去只会被服务端 413 拒掉。
- **裁决必须在勾选框之外**：`confirmSelection()` 对选中的所有视频一律跑一遍 `decide()`（**规则与勾选框解耦**），压不压只看勾选框；裁决放后台线程（主线程探测会 ANR），拒绝时 `Toast` 一句话并**留在相册**（让用户改选），同时打一行 `压缩裁决：… → 拒绝/要压/不用压` 的日志（拒绝路径必须可查，否则用户看到的就是"点了没反应"）。
- **失败 / 取消一律交原文件**：一个压不了的视频不该让整条瞬间发不出去；勾选框关掉就是原样上传（超上限由页面报错；mkv 这类容器站点不收，只能靠压缩转成 mp4）。
- **清理时机与图片编辑产物同规矩**：`VideoCompressor.clearCache()` 只在**打开相册之前**调（`shutdown()` 里不能清 —— 点「完成」时 `closeAlbumPicker()` 先跑，页面还要拿这个文件去上传，见 §6b-1 最后一条与 P-150 那一族）。
- **ABI 与许可证**：依赖 `dev.ffmpegkit-maintained:ffmpeg-kit-min-gpl`（含 x264 ⇒ **GPL-3.0**，整个 App 按 GPL-3.0 分发），只支持 arm64-v8a / x86_64，**且必须手补 `com.arthenica:smart-exception-java`**，见 [build.md](build.md) §3b、P-181 与 P-183。
- **验证口径**：JVM 侧 `gradlew :app:testDebugUnitTest` 全绿（阈值边界、30 分钟边界、关掉不压、站点上限触发、码率反推、参数成形）；设备侧实测（2026-10-11，模拟器 x86_64）：34 秒 H.265 mkv → `要压（长边 720）` → 12 秒后 `文件选择完成`，产物 `compress-*.mp4` 2029529 字节 / `video/mp4`，页面确认收到；42 分钟 H.265 mkv → `拒绝：这段视频 42:01 超过 30 分钟上限`（勾选框开/关各验一次），进程全程存活、无 ffmpeg 启动。

### ★ `content://` → `file://`：这一步不能省

GeckoView 是在**内容进程**里把 URI 解析成 DOM File 的，那里拿不到 App 的 `content://` 授权。把选择器返回的 `content://` 直接交给 `prompt.confirm()`，日志里会出现：

```
W GeckoViewFilePickerDelegate: Error resolving files from file picker:
  [Exception... "File error: Unrecognized path" nsresult: "0x80520001 (NS_ERROR_FILE_UNRECOGNIZED_PATH)"]
  _getDOMFile()@resource://gre/modules/FilePickerDelegate.sys.mjs:214
```

**页面不会报错，只是输入框仍显示「未选择」**——很容易被误判成"选择器坏了"。

Mozilla 官方示例 `BasicGeckoViewPrompt.onFileCallbackResult` 的做法是：非 `file://` 的 URI 先复制到 `cacheDir/picked/`，再把 `Uri.fromFile(...)` 交给 `confirm()`。本项目的 `toFileUri()` 是这段的 Kotlin 移植（多选逐个复制）。**副本名先经 `PickedFileName.sanitize()`**：超长/非法字符压到 80 并保留扩展名；站点最终用内容 hash 存媒体，原名不参与寻址，压短不会改变媒体身份。

⚠️ 副本清理**必须放在每次选择的开头、循环之外**：写进 `toFileUri()` 里会在多选时把刚拷好的前几个文件删掉（写错过一次）。

## 6c. 下拉框与日期时间：`<select>` / `<input type="date|time|datetime-local">` 同样必须由宿主接管

**和上传（§6b）是同一类坑**：这两类控件 Gecko **自己画不出来**，它把用户点开控件的动作变成 prompt 交给宿主
（内核源码 `modules/GeckoViewPrompt.sys.mjs`：`_handleSelect` → `{type:"choice"}`、`_handleDateTime` → `{type:"datetime"}`，
最终落到 `PromptDelegate.onChoicePrompt` / `onDateTimePrompt`）。宿主不接管时 prompt 永远悬着——
**页面上控件看着完全正常**（有边框、显示着 `03:00`、下拉框带箭头），点下去只有一个焦点圈，
最容易被误判成"站点样式/布局问题"而去改 CSS，方向全错。

实现分四层，**"谁长什么样"和"谁负责回填"分开**：

| 文件 | 职责 |
|---|---|
| `MainActivity.kt` | `promptDelegate` 转发（`onChoicePrompt` / `onDateTimePrompt`）+ `trackPrompt()` 挂 prompt 实例回调 |
| `FormPrompts.kt` | prompt → 哪一屏选择器 → 何时回填；`datetime-local`「选日期 → 选时间」的流程状态；min/max 收口 |
| `PickerViews.kt` | 三块卡片式选择器：`ChoicePicker`（列表）/ `CalendarPicker`（自绘月历）/ `TimePicker`（时·分两列） |
| `HostUi.kt` | **统一视觉语言**：色板、圆角、字号、按钮、弹层外壳 `HostDialog`（地址表单与这三块选择器共用同一份） |

| 控件 | prompt 类型 | 宿主弹什么 |
|---|---|---|
| `<select>` 单选（下拉框与 `size>1` 列表） | `ChoicePrompt.Type.MENU=1` / `SINGLE=2` | 卡片列表，点一项即回填并收屏 |
| `<select multiple>` | `ChoicePrompt.Type.MULTIPLE=3` | 同一张列表 + 勾选方框、「确定 / 取消」 |
| `<input type="date">` | `DateTimePrompt.Type.DATE=1` | 自绘月历 → 回填 `yyyy-MM-dd` |
| `<input type="month">` | `MONTH=2` | 自绘月历 → 回填 `yyyy-MM` |
| `<input type="week">` | `WEEK=3` | 自绘月历 → 回填 ISO `yyyy-Www` |
| `<input type="time">` | `TIME=4` | 时/分两列（00–23 / 00–59）→ 回填 `HH:mm` |
| `<input type="datetime-local">` | `DATETIME_LOCAL=5` | 月历 →（「下一步」）时/分两列 → 回填 `yyyy-MM-ddTHH:mm` |

### 6c-1. 长什么样：跟「请输入网站地址」同一套，不用系统默认控件

系统的 `AlertDialog` / `DatePickerDialog` / `TimePickerDialog` 是 header 色带 + 全大写按钮 + 系统强调色，
放在站点界面里一眼出戏；而且它们的配色只能靠 theme 属性改，做不到跟随本站配色。所以三块选择器**全部自绘**，
取值只从 `HostUi.kt` 来（用户要求：「和设置网站地址类似的样式，简约清新不突兀，自动跟随系统黑白色调」）：

| 维度 | 取值（`HostUi.kt` = 单一事实源） |
|---|---|
| 外壳 | 居中圆角卡片（18dp）+ 系统变暗背板（`dimAmount 0.45`）；宽 `min(屏宽 − 56dp, 400dp)`，与地址表单的左右留白一致 |
| 底色 | 浅色 `surface #FFFFFF`；深色 `surface #1A1E24`（比全屏底色 `#0E1013` 亮一档，否则卡片在暗背景上看不出边界） |
| 文字 | 标题 17sp 粗体 / 说明 13sp / 正文 15sp；主色浅色 `#2C7BE5`、深色 `#4C9BF5` |
| 选中态 | 主色的 **14% 半透明薄底** + 主色粗体 + 右侧 ✓（多选是描边方框 → 实心后打勾） |
| 按钮 | 与地址表单**同款**：主按钮 48dp 实心、取消 44dp 留白、圆角 10dp |
| 日历 | 周一开头；今天用主色字、选中填一块 12dp 圆角的主色；整月都在 min/max 之外时翻页箭头置灰 |
| 时间 | 时/分两列可滚动（40dp/行 × 5 行视口），打开时自动把当前值滚到中间 |

深浅色的判定与刷新：

- 色板看 `resources.configuration.uiMode`。清单里 `uiMode` 由 Activity 自己处理（不重建），所以
  `FormPicker.show()` **每次都重新取一次 `hostPalette()`**，而不是构造时缓存。
- **主题切换时开着的选择器会现场重画**：`onConfigurationChanged` → `activeFormPrompts?.applyTheme()` →
  `FormPicker.show()`；选择状态留在 picker / 流程对象里，重画不丢。实测在「选时间」卡片开着时切
  `cmd uimode night yes`，卡片当场从白卡变深卡、文字与按钮一起换（不是等下次打开才生效）。

每条都是查过/踩过才这么写的：

- **类型常量在 `ChoicePrompt.Type` / `DateTimePrompt.Type` 上**，值是 `javap -constants` 实读的（MENU/SINGLE/MULTIPLE = 1/2/3；DATE/MONTH/WEEK/TIME/DATETIME_LOCAL = 1…5）。别照老文章写。
- **prompt 回调是 `@UiThread`**（`javap -v` 里能看到 `Landroidx/annotation/UiThread;`）→ 可以直接建对话框，不需要 `runOnUiThread`。
- **回填后页面自己派发 `input` + `change`**（内核 `_dispatchEvents`）→ React 受控组件照常走 `onChange`。**站点侧不需要为安卓客户端做任何适配**。
- **先判 `isComplete()` 再回填**：页面可能已经把这个 prompt 收掉（`MozCloseDateTimePicker`、`<select>` 失焦），这时再 confirm 是往一个已完成的 prompt 上写结果。`trackPrompt()` 还挂 `PromptInstanceDelegate.onPromptDismiss` → 页面撤 prompt 时宿主把对话框一起关掉，避免"页面上控件都没了，手里还压着一个能点确定的框"。
- **取消一律走 `prompt.dismiss()`**（对话框的 `setOnCancelListener`，覆盖返回键与点外部）→ 页面值不变。
- **`min`/`max` 要收到底**：日期选择器直接吃 `datePicker.minDate/maxDate`（用当天**起点/终点**毫秒，免得边界那一天自己选不上）；`datetime-local` 的日期卡住下限后，**同一天的更早时刻**还得再收一次——`<input min="now">` 的页面（预约恢复、预约更新）放过去的话，表单会静默进入 HTML 判定无效的状态。收敛到边界时弹 Toast 说明，不静默改用户输入。
- **精度到分钟**：回填 `yyyy-MM-ddTHH:mm`。站点里 `step={1}` 的字段（「站点开始运行时间」）秒位会归零，值仍合规。
- 内核给的 `ChoicePrompt.title` 为空时不设标题，不硬塞「请选择」。

证据（2026-10-02，模拟器 x86_64 / Android 11 实测）：

| 场景 | 修之前 | 修之后 |
|---|---|---|
| `/admin/backups` 点「备份时刻（几点几分）」 | 只有焦点圈，不弹任何东西 | 卡片式时间选择器（预置 03:00，两列自动定位）→ 选 05:00 → 输入框变 `05:00`（换更早的 06:30 复测时，保存后库里 `backupAtTime = "06:30"`） |
| `/admin/posts` 点「全部状态」下拉框 | 只有焦点圈，不弹列表 | 卡片列表（4 项、当前项主色薄底 + ✓）→ 选「草稿」→ 框里显示「草稿」→ 点筛选后 URL 变 `?q=&status=draft` |
| `/admin/settings` 点「站点开始运行时间」 | 同上，点不动 | 自绘月历（预置 2026-09-01）→「下一步」→ 时/分两列（副标题 `2026年9月24日 周四 · 21:29`）→ 输入框变 `2026/09/24 21:29:00` |
| 深色 | — | 候选卡片全部转深色（卡 `#1A1E24`、字 `#F4F5F7`、主按钮 `#4C9BF5`）；**卡片开着时切系统主题会现场重画** |
| 地址表单 | — | 重构成共用 `HostUi` 后浅/深两色与改造前一致（无回归） |
| logcat | 没有这两条日志 | `I SmartBlog: onChoicePrompt type=2 选项=4`、`onDateTimePrompt type=4 值=03:00`、`onDateTimePrompt type=5 值=2026-09-01T21:29:41` |

## 7. 已知坑（Android 侧的写在本节，站点侧的写 `docs/pitfalls.md`）

| 现象 | 根因 |
|---|---|
| 点了「确认」后**页面一片白**，但 dev server 有 `GET / 200`、logcat 里 React 也启动了 | `GeckoView` 建出来的那一刻是隐藏的，而可见性在**创建之前**就被设置 → 顺序反了，视图永远停在 `GONE`。修法：`ensureSession()` 按 `setupView == null` 决定初始可见性，且 `loadSite()` 要在 `ensureSession()` **之后**再设一次 |
| **点上传没反应**：系统选择器不弹，页面一直等 | 宿主没实现 `PromptDelegate.onFilePrompt`（§6b） |
| **点下拉框 / 点日期时间输入没反应**：框看着完全正常，点下去只有焦点圈 | 宿主没实现 `PromptDelegate.onChoicePrompt` / `onDateTimePrompt`（§6c）——不是站点样式问题，别去改 CSS |
| **弹层"一眼出戏"**：蓝色 header 色带 + 全大写按钮 + 系统强调色 | 用了系统 `AlertDialog` / `DatePickerDialog` / `TimePickerDialog` 就是这个下场，且它们的配色只能靠 theme 属性改 → 三块选择器自绘，取值只从 `HostUi.kt` 来（§6c-1）。**新加界面元素时别再用系统对话框** |
| 选择器弹了、文件也选中了，**页面仍是「未选择」** | `content://` 没转成 `file://`，Gecko 内容进程解析不了（§6b） |
| **开屏一片白、logo 不见** | GeckoView 一 `ensureSession()` 就是 `VISIBLE` 且 `addView` 到同一容器，**盖住了先加进去的开屏**（看到的是没加载完的 Web 视图）。修法：`ensureSession()` 里加完 web view + 浮动按钮后 `splashView?.bringToFront()`（§9） |
| 取上传上限报 `FileNotFoundException: …/xxx.html/api/upload/limits` | 拼接时用了**保存的完整地址**（可能是个具体页面）而不是 origin。修法：`URI(saved)` 取 `scheme://authority` 再拼路径（`refreshUploadLimits()`） |
| 宿主自己的 http 请求报 `Cleartext HTTP traffic … not permitted` | 走 Android 网络栈的请求受明文策略管（GeckoView 自带内核所以网页没事）。修法：清单开 `usesCleartextTraffic`，并把明文警告的判定从 `NetworkSecurityPolicy` 改成看 URL 协议（§6） |
| 编译期报 `Unresolved reference 'getUserAgent'` | 把 `GeckoSession.getDefaultUserAgent()`（静态、返回 `String`）写成了实例上的 `getUserAgent()`（返回 `GeckoResult<String>`）→ 换成静态那个（§2b） |
| 地址填 `ftp://x` 竟然"通过了"，变成 `https://ftp://x` | 归一化只看 `startsWith("http")` 就补协议，`ftp://x` 被判成"没写协议"。修法：补协议前先用 `^[A-Za-z][A-Za-z0-9+.\-]*://` 判"已经带了协议"（§2，单测 `AppUrlTest` 守着） |
| **预览黑屏**：顶栏「n / N」「完成(0)」都在，中间全黑 | 三页窗口的子页宽度要等下一轮布局才生效，`onSizeChanged` 里改完就当轮 `scrollTo` 被夹回 0 → 停在空页（**P-176**，§6b-2） |
| 编译报 `Syntax error: Unclosed comment` + 别处一串 `Unresolved reference` | KDoc 里写了 `*.jpg` 这类含 `/*` 的通配路径 —— Kotlin 块注释**可嵌套**（**P-177**） |
| `setTextColor(foreground)` 报"没有匹配的重载" | 自定义字段与 `View.getBackground()/getForeground()` 撞名，被解析成 `Drawable`（**P-178**，改名 `bgColor`/`fgColor`） |
| 单测抛 `Cannot coerce value to an empty range` | 浮点误差让 `coerceIn(min, max)` 区间空了；写 `coerceIn(low, max(low, high))`（**P-179**） |
| 通知点开文章后**以后每次启动都进那篇文章** | 深链整条写进了 `site_url`（§2 的深链表；单测 `通知深链只落 origin` 守着） |

## 8. 登录态 / cookie 的持久性（全部实测，不是推断）

结论：**退出 App 不需要重新登录**（7 天内）。

| 环节 | 实测证据 |
|---|---|
| 服务器发的会话 cookie 是**持久化**的 | `set-cookie: myblog.session=…; Path=/; Expires=Thu, 08 Oct 2026 07:57:09 GMT; **Max-Age=604740**; HttpOnly; SameSite=lax`。iron-session 的 `computeCookieMaxAge()` 会把 `ttl` 自动落成 `Max-Age`；本项目 `SESSION_TTL_SECONDS = 60*60*24*7`（`lib/auth/session.ts:6`） |
| GeckoView 把它**写到磁盘** | 库在 `files/mozilla/<profile>.default/cookies.sqlite`。`run-as` 抠出来用 sqlite 读：`myblog.session` 414B / `myblog.csrf` 129B，`expiry` 都是 7 天后 |
| 重启后**确实被读回并使用** | 强杀进程 → 把地址改成 `/admin` → 重启 → URL 停在 `/admin`，**没有被弹回 `/admin/login`**（`proxy.ts` 只在 session cookie 缺失时才重定向） |

**要重新登录的四种情况**：

1. 超过 **7 天**没访问过站点（服务端 iron-session 的 `ttl` 到期，`session.ts`）；
2. 在站点上点了「退出登录」（`destroySession()` 会清 cookie）；
3. 卸载 App、或在系统里「清除数据」（`pm clear` 同样会清掉整个 profile）；
4. **换了 host**——cookie 按域名隔离，`10.0.2.2` 与 `192.168.2.36` 是两套 jar（**端口不参与隔离**，`:3000` 与 `:3001` 共用）。所以把地址从模拟器地址改成真机局域网地址，需要重新登录一次。

**App 侧不写任何 cookie 逻辑**：GeckoView 自带 cookie 存储，`proxy.ts` 的 CSRF 双重提交自动通过 —— 这也是当初选 GeckoView 而不是自建 HTTP 客户端的一个实际收益。

## 9. 开屏（圆形 logo，跟随系统深浅色）

`showSplash()` 在 `onCreate` 里挂一个全屏 View：**纯色背景（`hostPalette().background`，跟随系统深浅色）+ 居中的圆形 logo**，别无他物（用户明确要求"没有其他任何东西"）。

撤掉的时机，三者取先到：

| 时机 | 为什么 |
|---|---|
| `ProgressDelegate.onPageStop` | 首屏加载完成——开屏本质上就是加载页 |
| `showSiteForm()` | 地址表单是覆盖层，不撤就会被它压住（首启已不再走这条路，保留作为防御） |
| `SPLASH_MAX_MS`（6 秒） | 兜底：网络/内核出问题时也不能永久遮挡 |

另外 `SPLASH_MIN_MS`（1.2s）是**最短**显示时间：本机 dev server 太快，不加这个会一闪而过。实现上是在 `hideSplash()` 里用 `postDelayed` 补足差值，并用 `splashPendingHide` 标志避免重复排队。

**三件事必须同时成立，否则开屏"全程不出现"（踩过一次，用户复现过）：**

1. **建 GeckoView 要延到下一帧**：`ensureSession()` 是同步重活（加载 libxul，秒级）。在 `onCreate` 里直接 `loadSite()` 会把**第一帧整个堵在它后面**，开屏根本没机会画出来。所以是 `container.post { … loadSite(…) }`。
2. **最短时间从「真的画到屏幕上」起算**：用 `viewTreeObserver.addOnPreDrawListener` 里的那一刻当 `splashShownAt`。写在 `showSplash()` 里的话，建 GeckoView 的耗时会把 1.2s 直接吃光。
3. **明文警告等开屏撤了再弹**：`maybeWarnInsecure()` 在开屏还盖着时先存进 `pendingInsecureWarning`，`hideSplash()` 收尾时再弹——否则弹窗正好压在屏幕中央的 logo 上，开屏就毁了。

> ⚠️ **必须 `bringToFront()`。** GeckoView 一旦 `ensureSession()` 建出来就是 `VISIBLE` 并被 `addView` 到同一个容器，**它会盖住先加进去的开屏**——表现是"开屏一片白、logo 不见"，而白的那层其实是还没加载完的 Web 视图。这个坑在验证时踩过一次，排查办法：临时把 `SPLASH_MIN_MS` 调到 6 秒再截图（700ms 的窗口基本抓不到）。

圆形 logo 在 `res/drawable/splash_logo.xml`：与 `docs/android/icon.svg` 同一组路径，底从圆角方改成正圆。**改一处记得改另一处**。

## 10. 消息提醒（路线 A：前台轮询 + 后台巡检 + 本地通知）

方案与取舍见 [push-plan.md](push-plan.md)；这里是"代码怎么分层、改动时别踩什么"。

```
PushRules.kt       纯逻辑（无 Android API，11 条 JVM 单测）：增量解析 / 管理员态 / 建基线 / 指纹去重 / 游标校验
PushSettings.kt    状态：与站点地址共用 smartblog 偏好（开关、游标、已提醒指纹、管理员态、上次结果）
AppNotifier.kt     运行时：前台 60s 轮询、后台巡检调度、两个渠道、发通知、点通知回 App
NotifyAlarmReceiver.kt  闹钟唤醒 + 重启/升级重排（setAndAllowWhileIdle，不需要精确闹钟权限）
MainActivity.kt    UI 入口：⋮ →「消息提醒」（两个开关 + 状态行）、POST_NOTIFICATIONS 首次请求、onStart/onStop 前后台切换
```

**同步一次的顺序（每一步都在省下一次无用的网络请求）**：

| 步 | 动作 | 判据 |
|---|---|---|
| 1 | 开关关着 / 正在同步 / 没有站点地址 | 直接返回 |
| 2 | `GET /api/client/status` | **必须 `app:true`**（地址被指到别的站点就不推）；`admin:true` 或本地管理员态 → 停 |
| 3 | `GET /api/feed/updates?since=…&limit=20` | 没有 `since` = 首次 → **只建基线、不弹通知**（否则新装 App 被一屏历史刷屏） |
| 4 | 过滤已提醒指纹 → 发通知 → 存新游标 + 新指纹 | 指纹 = `post:<站内路径>` / `moment:<id>`（改标题不重复推） |

**管理员抑制（用户钦定的规则：登录后台一条都不推）**：

- 服务端判：`/api/client/status` 的 `admin` 字段（与 `requireAdmin()` 同判据）；
- App 侧兜底：GeckoView 157 **没有 cookie API**（`getCookieManager` 已移除，AAR `javap` 实读），`myblog.session` 是 HttpOnly → 只能按"看到 `/admin` 页"判，**粘性**，只有在 `/admin/login` 才解除。规则实现在 `PushRules.adminStateAfterNavigation()`（有单测），信号源是 `NavigationDelegate.onLoadRequest` 的 `request.uri`。

**通知渠道**：`posts` / `moments` 两个（用户能在系统里单独关掉一个）。点通知 → `PendingIntent` 带 `ACTION_VIEW` + 站内绝对地址 → `MainActivity.handleDeepLink()` 直接进那篇文章/那条瞬间（**同时把地址改成该站**，用户可能在 App 里换过站点）。

**权限清单与"刻意不要"的三个**（理由见 push-plan §4）：`POST_NOTIFICATIONS` / `WAKE_LOCK` / `RECEIVE_BOOT_COMPLETED`；**不要** `SCHEDULE_EXACT_ALARM`、`FOREGROUND_SERVICE`、`IGNORE_BATTERY_OPTIMIZATIONS`。

**改动时别踩**：

- 前台轮询的定时器挂在主线程 `Handler` 上，`onStart/onStop` 成对开关；**别**在 `onResume` 里起（切换弹窗会重置计时）。
- 所有同步跑在**单线程 executor** 上（`syncRunning` 兜并发）；状态读写在同一个线程里做，别从别处并发写 `PushSettings`。
- 后台巡检是**一次只排一次**（fire-and-reschedule）：改间隔不用取消旧闹钟，重启后靠 `BOOT_COMPLETED` 自愈。
- 唤醒锁必须带**超时**（60s）并在 `finally` 里释放，否则一次网络卡死会让系统一直以为是我们在干活。
- `shared_prefs/*.xml` **手改不可靠**（App 进程活着时内存副本会覆盖回去），验证时用 `pm clear` + 构建期 `-PstartUrl`（见 P-159）。
