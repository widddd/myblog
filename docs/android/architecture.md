# architecture.md — 宿主结构与交互约定

> 全部实现都在 `androidapp/app/src/main/java/com/smartblog/app/MainActivity.kt` 一个文件里。
> 刻意不引 AppCompat / Material / Compose：界面用系统原生控件在代码里搭，依赖面只有 GeckoView + androidx.activity。

## 1. 视图分层

```
FrameLayout(container)          ← res/layout/activity_main.xml，只是占位
  ├─ GeckoView                  ← 懒创建：第一次真正要加载页面时才建
  ├─ 浮动入口（TextView 画成圆）  ← 右下角，42dp，半透明
  └─ 地址表单（View）            ← 只在首启 / 修改时挂上去，压在最上层
```

会话（`GeckoSession`）与视图一起懒创建（`ensureSession()`），所以「还没填地址」的首次启动不会白白拉起 Gecko 内核。

## 2. 站点地址是**用户数据**，不是编译期常量

| | |
|---|---|
| 存储 | `SharedPreferences("smartblog")` → `site_url` |
| `BuildConfig.START_URL`（`-PstartUrl=` 注入） | **只是首次输入框的预填值**，不是运行时事实源 |
| 首启判定 | `site_url` 不存在或为空 → 弹地址表单 |
| 复现首启 | `adb shell pm clear com.smartblog.app` |
| 修改入口 | 右下角浮动 ⋮ → 「修改网站地址」 |

地址归一化（`normalizeSiteUrl()`）：没写协议按 `http://` 补；只接受 `http`/`https` 且必须有主机名；末尾斜杠去掉；非法输入在表单内原地报错、**不落盘**。

## 3. 返回键语义（页面自己没有地址栏，必须在这里兜住）

| 当前状态 | 返回键 |
|---|---|
| 首启地址表单 | **退出 App** —— 没有地址就等于没有可访问的内容，停在空页面没有意义 |
| 「修改」模式的表单 | 取消，回到网页 |
| 网页 | 能后退就后退，否则退出（`canGoBack` 来自 `NavigationDelegate.onCanGoBack`，`GeckoSession` 上没有这个查询方法） |

## 4. 深浅色跟随系统

- 清单里 `android:configChanges` 含 `uiMode` → Activity **不会重建** → 必须自己实现 `onConfigurationChanged()` 重画表单。
- 重画时把用户**已经敲进去的内容带回去**（`showSiteForm(preset = ...)`），否则切主题会吞掉输入。
- 黑/白两套色值集中在 `palette()`；表单之外的页面用站点自己的配色，宿主不干预。

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
| 提示类型 | `FilePrompt.Type.SINGLE=1 / MULTIPLE=2 / FOLDER=3`。**常量在 `FilePrompt.Type` 上**，`FilePrompt` 本体只有 `type` / `mimeTypes` / `capture` 三个字段（javap 实测；`PromptDelegate` 接口上已经没有这些常量了，别照着老文章写） |
| **图片走自有相册** | `accept` 是**纯图片**（全部 mimeTypes 以 `image/` 开头）→ 弹自有全屏相册 `AlbumPickerView`；其它（视频/音频/任意文件，以及 `MEDIA_ACCEPT` 那种图+视频+音频混合）→ 系统选择器，行为完全不变。判定见 `isImageOnlyAccept()` |
| **能选几张** | 由**服务端**决定：后台 Setting `uploadMaxImagesPerBatch`（默认 9，设置页可改）→ `GET /api/upload/limits` 的 `maxImages`。单选输入（封面）单点即返回；多选输入显示「已选 n/9」。取不到就用兜底 9——**绝不能因为取不到就不让选图**。生效时机：后台同一个进程里一保存就立即生效（`setSetting()` 当场刷缓存）；`getSetting` 的 60s 进程内缓存只在值由别的进程写入时才咬合，而接口自带 `Cache-Control: public, max-age=300`，**中间有反代/CDN 缓存时最多可能 5 分钟旧值**——别把它当「改完立刻全世界生效」 |
| 相册权限 | `READ_MEDIA_IMAGES`（API 33+）/ `READ_EXTERNAL_STORAGE`（≤32），用到的时刻才要；**拒绝就退回系统选择器**，绝不让用户传不了图 |
| 选择器 | `ACTION_OPEN_DOCUMENT` + `CATEGORY_OPENABLE`，仅 MULTIPLE 时加 `EXTRA_ALLOW_MULTIPLE` |
| MIME 过滤 | 纯媒体 accept（`image/` `video/` `audio/`）→ 传 `EXTRA_MIME_TYPES`，选图时只列图片；其它（站点用扩展名写的 `.md` / `.tar.gz` → Gecko 映射成 `text/markdown`、`application/gzip`）→ **不过滤**，按 MIME 过滤会让用户在自己存储里找不到文件。见 `mediaFilters()` |
| 目录上传 | 站点没有这个入口，显式 `dismiss()` + 日志，不给半残的目录选择 |
| 生命周期 | `registerForActivityResult`；同一时刻只保留一个待决 prompt，重复触发先取消前一个 |

### 6b-1. 自有相册视图（`AlbumPickerView.kt`）

全屏覆盖层：顶栏「取消 / 已选 n/9（单选时是"选择一张照片"）/ 完成」+ 三列网格。

- 数据源是 `MediaStore.Images.EXTERNAL_CONTENT_URI`，按 `DATE_ADDED DESC`（刚拍的排前面）。
- **相册集（bucket）**：一次查询把 `BUCKET_ID`/`BUCKET_DISPLAY_NAME` 一起取回来，在内存里分组。顶部第二行是当前相册名（可点），展开是「全部照片 (N) + 各相册集 (n)」，按**最近有照片**的排前面。切换只过滤已取到的列表——**不重新查库、不丢缩略图缓存**。
  - ⚠️ 那一行用 `FrameLayout` 而不是横向 `LinearLayout`：底部分隔线是 `MATCH_PARENT` 宽，放进横排会把相册名挤成 0 宽（现象是"只剩一条线、看不见相册名"）。
- **不引依赖**：网格用 `GridView` + `BaseAdapter`，缩略图自己两遍解码（先 `inJustDecodeBounds` 量尺寸，再按 `inSampleSize` 采样到 ~300px）+ `LruCache`（按张数计，最多 120）。**不要**为这个引 Glide/Coil。
- 视图复用要**比对 `image.tag`** 再贴 bitmap，否则快速滚动会串图。
- 单选：点一张立刻返回。多选：点选/取消，右上角「完成」；超出上限时顶栏提示「最多选 N 张」而不是静默忽略。
- 收尾统一走 `confirmPending(uris)`——**和系统选择器同一条收口**，`content://` → `file://` 只在那一处做。

### ★ `content://` → `file://`：这一步不能省

GeckoView 是在**内容进程**里把 URI 解析成 DOM File 的，那里拿不到 App 的 `content://` 授权。把选择器返回的 `content://` 直接交给 `prompt.confirm()`，日志里会出现：

```
W GeckoViewFilePickerDelegate: Error resolving files from file picker:
  [Exception... "File error: Unrecognized path" nsresult: "0x80520001 (NS_ERROR_FILE_UNRECOGNIZED_PATH)"]
  _getDOMFile()@resource://gre/modules/FilePickerDelegate.sys.mjs:214
```

**页面不会报错，只是输入框仍显示「未选择」**——很容易被误判成"选择器坏了"。

Mozilla 官方示例 `BasicGeckoViewPrompt.onFileCallbackResult` 的做法是：非 `file://` 的 URI 先复制到 `cacheDir/picked/`，再把 `Uri.fromFile(...)` 交给 `confirm()`。本项目的 `toFileUri()` 是这段的 Kotlin 移植（多选逐个复制）。

⚠️ 副本清理**必须放在每次选择的开头、循环之外**：写进 `toFileUri()` 里会在多选时把刚拷好的前几个文件删掉（写错过一次）。

## 7. 已知坑（Android 侧的写在本节，站点侧的写 `docs/pitfalls.md`）

| 现象 | 根因 |
|---|---|
| 点了「确认」后**页面一片白**，但 dev server 有 `GET / 200`、logcat 里 React 也启动了 | `GeckoView` 建出来的那一刻是隐藏的，而可见性在**创建之前**就被设置 → 顺序反了，视图永远停在 `GONE`。修法：`ensureSession()` 按 `setupView == null` 决定初始可见性，且 `loadSite()` 要在 `ensureSession()` **之后**再设一次 |
| **点上传没反应**：系统选择器不弹，页面一直等 | 宿主没实现 `PromptDelegate.onFilePrompt`（§6b） |
| 选择器弹了、文件也选中了，**页面仍是「未选择」** | `content://` 没转成 `file://`，Gecko 内容进程解析不了（§6b） |
| **开屏一片白、logo 不见** | GeckoView 一 `ensureSession()` 就是 `VISIBLE` 且 `addView` 到同一容器，**盖住了先加进去的开屏**（看到的是没加载完的 Web 视图）。修法：`ensureSession()` 里加完 web view + 浮动按钮后 `splashView?.bringToFront()`（§9） |
| 取上传上限报 `FileNotFoundException: …/xxx.html/api/upload/limits` | 拼接时用了**保存的完整地址**（可能是个具体页面）而不是 origin。修法：`URI(saved)` 取 `scheme://authority` 再拼路径（`refreshUploadLimits()`） |
| 宿主自己的 http 请求报 `Cleartext HTTP traffic … not permitted` | 走 Android 网络栈的请求受明文策略管（GeckoView 自带内核所以网页没事）。修法：清单开 `usesCleartextTraffic`，并把明文警告的判定从 `NetworkSecurityPolicy` 改成看 URL 协议（§6） |

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

`showSplash()` 在 `onCreate` 里挂一个全屏 View：**纯色背景（`palette().background`，跟随系统深浅色）+ 居中的圆形 logo**，别无他物（用户明确要求"没有其他任何东西"）。

撤掉的时机，三者取先到：

| 时机 | 为什么 |
|---|---|
| `ProgressDelegate.onPageStop` | 首屏加载完成——开屏本质上就是加载页 |
| `showSiteForm()` | 首启没有页面要加载，`onPageStop` 永远不会来，不自己撤就会一直挡着表单 |
| `SPLASH_MAX_MS`（6 秒） | 兜底：网络/内核出问题时也不能永久遮挡 |

另外 `SPLASH_MIN_MS`（1.2s）是**最短**显示时间：本机 dev server 太快，不加这个会一闪而过。实现上是在 `hideSplash()` 里用 `postDelayed` 补足差值，并用 `splashPendingHide` 标志避免重复排队。

**三件事必须同时成立，否则开屏"全程不出现"（踩过一次，用户复现过）：**

1. **建 GeckoView 要延到下一帧**：`ensureSession()` 是同步重活（加载 libxul，秒级）。在 `onCreate` 里直接 `loadSite()` 会把**第一帧整个堵在它后面**，开屏根本没机会画出来。所以是 `container.post { … loadSite(…) }`。
2. **最短时间从「真的画到屏幕上」起算**：用 `viewTreeObserver.addOnPreDrawListener` 里的那一刻当 `splashShownAt`。写在 `showSplash()` 里的话，建 GeckoView 的耗时会把 1.2s 直接吃光。
3. **明文警告等开屏撤了再弹**：`maybeWarnInsecure()` 在开屏还盖着时先存进 `pendingInsecureWarning`，`hideSplash()` 收尾时再弹——否则弹窗正好压在屏幕中央的 logo 上，开屏就毁了。

> ⚠️ **必须 `bringToFront()`。** GeckoView 一旦 `ensureSession()` 建出来就是 `VISIBLE` 并被 `addView` 到同一个容器，**它会盖住先加进去的开屏**——表现是"开屏一片白、logo 不见"，而白的那层其实是还没加载完的 Web 视图。这个坑在验证时踩过一次，排查办法：临时把 `SPLASH_MIN_MS` 调到 6 秒再截图（700ms 的窗口基本抓不到）。

圆形 logo 在 `res/drawable/splash_logo.xml`：与 `docs/android/icon.svg` 同一组路径，底从圆角方改成正圆。**改一处记得改另一处**。

