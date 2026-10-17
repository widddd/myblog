# push-plan.md — 给 App 加「可推送消息」的方案

> 状态：**路线 A 已实施（0.1.3）并在模拟器上端到端实测**；路线 B/C 仍是候选（未做）。
> 用户要求（2026-10-03）：App 支持推送消息；**检测到这是管理员的 App（已登录后台）就不推送**；
> 顺带回答「网页的 RSS 订阅是否支持瞬间和文章及时推送」。

## 实施记录（路线 A，2026-10-03）

| 件 | 位置 | 说明 |
|---|---|---|
| 纯逻辑 | `app/src/main/java/com/smartblog/app/PushRules.kt` | 增量解析、管理员态、首次建基线、指纹去重、游标校验（**11 条 JVM 单测**） |
| 状态 | `PushSettings.kt` | 与站点地址共用 `smartblog` 偏好文件：开关 / 游标 / 已提醒指纹 / 管理员态 / 上次结果 |
| 运行时 | `AppNotifier.kt` | 前台 60s 轮询（`Handler`）、后台 `AlarmManager` 巡检、两个通知渠道、点通知回 App |
| 后台唤醒 | `NotifyAlarmReceiver.kt` | `setAndAllowWhileIdle()`（**不要** `SCHEDULE_EXACT_ALARM`）+ 重启/升级重排 + 60s 唤醒锁 |
| 权限 | `AndroidManifest.xml` | `POST_NOTIFICATIONS`（Android 13+ 运行时）、`WAKE_LOCK`、`RECEIVE_BOOT_COMPLETED`。**刻意不要** `SCHEDULE_EXACT_ALARM` 与 `FOREGROUND_SERVICE` |
| 入口 | `MainActivity.kt` | ⋮ →「消息提醒」页面（两个开关 + 状态行）、菜单里两个快捷开关、点通知落地 |

**实测证据（模拟器 x86_64 / Android 11，dev server 作站点）**：

```
进入站点：http://10.0.2.2:3000                      ← 首启直达（没有地址表单）
同步完成：新条目=13 提醒=0 基线=true                  ← 首次只建基线，不刷屏
同步完成：新条目=1  提醒=1 基线=false                 ← 新建一篇文章后，下一轮就发通知
同步完成：新条目=1  提醒=0 基线=false                 ← 同一条不再重复提醒
dumpsys notification: pkg=com.smartblog.app channel=posts
                      android.title=通知链路测试文章
                      android.text=这条是用临时脚本插入的，用来验证 App 能不能收到通知。
```

**管理员抑制**：服务端判定（`/api/client/status`）+ App 侧兜底（看到 `/admin` 页即置管理员态，粘性，只有在 `/admin/login` 才解除）。模拟器上"在 App 里真的登录一次后台"未跑（需要 UI 填表），逻辑侧由 11 条单测覆盖；站点侧上线后用真机登一次即可确认状态行变成「已登录后台（不推送）」。

## 0. 结论先说

| 问题 | 答案 |
|---|---|
| RSS 能不能"及时推"到达订阅者？ | **能到"近实时"**：`/rss.xml` 现在是 `s-maxage=30, stale-while-revalidate=120`，订阅者最坏约 **2.5 分钟**看到新文章，命中缓存时秒级。这是"推"（可拉取的近实时源），不是"主动送达"——RSS 协议本身没有送达概念。 |
| RSS 覆盖瞬间吗？ | **不覆盖**。RSS 只有文章（`listArchivePosts()`），瞬间从来不在里面；而瞬间的可见期会让它**自己变少**（`lib/moments/visibility.ts`），做成 RSS 会让订阅者看到"内容消失"。瞬间的实时性由 `/moments`（`force-dynamic`，永远现算）保证。 |
| 那 App 的推送用什么源？ | **新接口 `/api/feed/updates`（已落地）**：文章 + 瞬间的增量，`?since=` 拉差量，才是推送该用的判据。 |
| 管理员会被自己站点的推送打扰吗？ | **不会**。规则是「在 App 里已登录后台 → 一条都不推」，判定走服务端（`/api/client/status` 的 `admin`），客户端的 httpOnly cookie 看不出来。 |
| 推送能多快？ | 见 §3 的三条路线：**A（前台/后台轮询）5–15 分钟**、**B（Web Push）真·即时但依赖 Mozilla 推送中转**、**C（长连接）秒级但要额外服务**。 |

## 1. 已经就位的底座（本轮交付）

| 件 | 位置 | 作用 |
|---|---|---|
| 客户端标识 | UA 追加 ` SmartBlog/<版本>`（`AppUrl.kt` ↔ `lib/client/detect.ts`） | 服务端认得出"这一发来自 App" |
| 管理员判定接口 | `GET /api/client/status` → `{app,admin,username}` | 通知层每次轮询先问它；`admin: true` 就抑制 |
| 增量内容接口 | `GET /api/feed/updates?since=&limit=` | 文章 + 瞬间的差量，带 `nextCursor`（服务端时间） |
| 内容缓存的失效 | 发布文章/瞬间本来就是 `revalidatePublicContent()` / 瞬间发布路径刷 `PUBLIC_CACHE_TAGS` | 通知接口的缓存跟着一起过期（同一批 tag） |

## 2. 规则：什么时候不推（用户决策）

| 条件 | 判定处 | 行为 |
|---|---|---|
| **这一发已登录后台**（管理员） | 服务端 `admin` 字段（`isAuthenticatedSession` + `findAdminAccount`） | **一条都不推**，永久抑制 |
| 页面正在前台且用户正在看 | App 侧 `Activity.onResume/onStop`（`ProcessLifecycleOwner` 或自己记 `isForeground`） | 不推系统通知，改成应用内提示（可选） |
| 内容是自己刚发的 | 增量指纹已经在本地（`post:{publicId}` / `moment:{id}`） | 不推 |
| 首次建立基线 | 第一次调 `/api/feed/updates`（不带 `since`） | 只记 `nextCursor`，**不弹任何通知**——否则装上 App 就会收到一屏旧内容 |

> 关键点：**抑制必须在服务端判**。App 里看得到的是 httpOnly session cookie（看不到内容），
> 而且在 App 里登录后台之后，这个 cookie 一直有效（见 [architecture.md](architecture.md) §8）——
> 也就是说**站长用 App 时永远是"管理员视角"**，自己发的内容绝不该反推给自己。

## 3. 三条路线（按推荐顺序）

### 路线 A：App 内轮询 + 本地通知（**推荐先做**，1–2 天量级）

```
App 侧（Kotlin，不引依赖的做法）：
  1. 从 GeckoView 的 CookieManager 取 myblog.session cookie（同一 jar，架构 §8 已实测）
  2. 定时 GET /api/client/status → admin? → 是就停（不注册通知、不轮询）
  3. 否：GET /api/feed/updates?since=<本机保存的 nextCursor>
  4. 有增量 → NotificationManager 发通知（channel：文章 / 瞬间）
  5. 保存新的 nextCursor（服务端时间，不信手机时钟）
触发时机：
  - App 在前台：每 60s 一次（用户能立刻看到，且只在自己打开 App 时耗电）
  - App 在后台：三条可选策略
      (a) 只在 App 进程活着时继续（简单，但被系统回收就没了）
      (b) 前台服务 + 常驻通知（可靠，但用户会看到一条常驻通知）
      (c) WorkManager 周期任务（最小 15 分钟，Doze 下可能更久）
```

| 维度 | 评价 |
|---|---|
| 延迟 | 前台约 1 分钟；后台 5–15 分钟（取决于策略） |
| 依赖 | **零新依赖**（`HttpURLConnection` + `NotificationManager`，与宿主现有风格一致） |
| 内容 | 文章标题 + 摘要 / 瞬间前 60 字（`momentNotifyText()` 已实现） |
| 点击行为 | `PendingIntent` 打开 App 并 `loadUri(href)`（`/posts/{publicId}/{slug}` 或 `/moments#moment-{id}`） |
| 权限 | Android 13+ 需要 `POST_NOTIFICATIONS` 运行时权限（只在这个功能打开时请求） |
| 管理员抑制 | ✅ 服务端判定 |
| 缺点 | 不是"真推送"：App 被系统冻结时收不到；后台轮询有轻微耗电 |

### 路线 B：标准 Web Push（真·即时，依赖 Mozilla 推送中转）

GeckoView **自带 Web Push 支持**（实测 AAR `157.0.20260924084938` 里有）：

```
org.mozilla.geckoview.WebPushController   → setDelegate(WebPushDelegate)
org.mozilla.geckoview.WebPushDelegate     → onSubscribe / onGetSubscription / onUnsubscribe
org.mozilla.geckoview.WebPushSubscription → {scope, endpoint, appServerKey, browserPublicKey, authSecret}
org.mozilla.geckoview.GeckoRuntime        → getWebPushController() / setWebNotificationDelegate()
```

站点侧配 Service Worker + `pushManager.subscribe()`，服务端用 `web-push`（VAPID）推。

| 维度 | 评价 |
|---|---|
| 延迟 | 真即时（秒级） |
| 拦住的地方 | **endpoint 是 Mozilla 的 `updates.push.services.mozilla.com`**：推送报文要经 Mozilla 中转，本站只能是"发送方"。自建推送服务器需要实现 autopush 那套 WebSocket 协议（App 侧还要带 App Services 的 push 组件），**不是个人博客该背的复杂度** |
| 服务端成本 | 新增一个 Node 依赖（`web-push`）+ VAPID 密钥对（要进 Setting / 备份，不能硬编码） |
| 其它 | GeckoView 的 Service Worker 需要宿主配合（`GeckoRuntime.ServiceWorkerDelegate`）；`android app` 里没有 FCM，Mozilla 侧的中转链路要多一道验证 |
| 结论 | **暂不做**。除非以后愿意接受"内容经过 Mozilla 推送服务"这一隐私/依赖前提 |

### 路线 C：自建长连接（自托管推送，秒级但要额外服务）

App 保持一条 WebSocket/SSE 长连到站点（或第三方网关），服务端发布时立刻下发。

| 维度 | 评价 |
|---|---|
| 延迟 | 秒级 |
| 代价 | 常驻连接 = 一条常驻通知 + 心跳耗电；服务端要看住连接（站点是 **1GB RAM 的轻量机 + pm2 fork 单实例**，长连接数一上来就吃内存）；Nginx 要放行 Upgrades |
| 结论 | 站点规模到"多设备、秒级必须"才值得，个人博客规模不划算 |

## 4. 分阶段落地（路线 A 已按 P1+P2+P3 落地）

| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | 路线 A 前台轮询 + 通知；`POST_NOTIFICATIONS` 权限；⋮ →「消息提醒」开关（默认开） | ✅ 已实施（0.1.3） |
| P2 | 管理员抑制：服务端 `/api/client/status` 判定 + App 侧看到 `/admin` 页兜底 | ✅ 已实施（真机登一次后台可复验） |
| P3 | 后台策略：`AlarmManager` 12 分钟巡检 + 重启/升级重排 + 唤醒锁 | ✅ 已实施 |
| P4（可选） | 路线 B/C 评估；应用内"新内容"小红点（复用 `/api/feed/updates`） | ⬜ 未做 |

**后台权限与取舍（用户要求"给 APP 要后台运行的相关权限"）**：

| 权限 | 要不要 | 为什么 |
|---|---|---|
| `POST_NOTIFICATIONS` | ✅ | Android 13+ 发通知必须运行时授权；首次启动请一次，拒绝不报错、功能静默降级 |
| `WAKE_LOCK` | ✅ | 后台被闹钟唤醒时抓一次网络唤醒锁（**60 秒超时兜底**，不会攥着不放） |
| `RECEIVE_BOOT_COMPLETED` | ✅ | 重启/升级后闹钟会丢，靠它重新排下一次巡检 |
| `SCHEDULE_EXACT_ALARM` | ❌ | 精确闹钟在 Android 12+ 是**特殊权限**，个人博客 App 不该要；用 `setAndAllowWhileIdle()` 就够，代价是 Doze 里可能十几分钟一次 |
| `FOREGROUND_SERVICE` | ❌ | 那会在通知栏**永久挂一条常驻通知**；为了"更快"牺牲"干净"不值得。真要更实时再单独评估 |
| `IGNORE_BATTERY_OPTIMIZATIONS` | ❌ | 那是"免杀白名单"，诱导用户关省电是骚扰 |

**后台巡检间隔**：12 分钟（`PushRules.BACKGROUND_INTERVAL_MS`）。亮屏时基本按时；Doze 里系统会把唤醒合并到维护窗口。前台时另有一条 60 秒轮询（只在 App 可见时跑）。

## 5. 服务端要不要再加东西

**不用**：`/api/feed/updates` + `/api/client/status` 已经够路线 A 用。真要加，只有两个小口子：

1. **瞬时通知的"到达即焚"**：现在接口是纯拉取，没有"已读"概念。若以后要小红点未读计数，加 `GET /api/feed/unread?since=`（同一份逻辑换个响应形状即可）。
2. **发布时的服务端主动推送**（只在走路线 B/C 时需要）：在 `revalidatePublicContent()` / 发瞬间的同一条写入路径后面挂一个 best-effort 通知器（失败只记日志，不能影响发布）。

## 6. 已知坑（写方案时就该记住的）

| 坑 | 说明 |
|---|---|
| 别用 `updatedAt` 当判据 | `@updatedAt` 会被浏览量自增、定时发布、publicId 回填刷成"现在"（P-087）→ 通知判据只看 `createdAt` |
| 定时发布会漏推 | `publishedAt` 可能是过去时间，用它会漏 → 接口按 `createdAt` 增量（已实现） |
| 手机时钟不可信 | 游标一律用服务端回的 `nextCursor`，别用 `System.currentTimeMillis()` |
| 首次必须"只建基线不弹" | 否则新装 App 收到一屏历史内容的通知 |
| 通知里的正文要压空白 | 通知栏会把换行压掉，留着反而难看 → `momentNotifyText()` 已经 `\s+` → 空格 |
| 别把"App 打开的网页"当成浏览器 | 推荐应用卡与推送抑制都靠 UA 标记；任何绕开（比如用户自己换 UA）都只是体验问题，不是安全问题——**别拿它当鉴权** |
