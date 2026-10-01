# debug.md — 联调与排障

> 宿主是 GeckoView（自带 Gecko 内核），**不能用 Chrome DevTools 驱**（没有 CDP 端口）。证据只能从三个地方取，别靠肉眼猜。

## 1. 三个证据源

| 源 | 拿到什么 | 怎么取 |
|---|---|---|
| **dev server 日志** | 页面发出的**每一条 HTTP 请求 + 状态码**（这是判断"资源到底有没有拿到"的最强证据） | 见 §2 |
| **adb logcat** | 页面 JS 错误、`console.*`、导航序列、Gecko 自身日志 | §3 |
| **adb 截图** | 渲染结果（含"样式正常但 JS 没跑"这类只有肉眼能分辨的差异） | §4 |

## 2. dev server 日志（后端侧的证据）

dev server 必须**由我们托管到文件**才能读：

```powershell
cd D:\code_projects\myblog\main
$p = Start-Process node -ArgumentList "scripts/boot.cjs","dev" -WorkingDirectory (Get-Location).Path `
     -RedirectStandardOutput data\_dev.out.log -RedirectStandardError data\_dev.err.log -PassThru -WindowStyle Hidden
```

`main/data/` 已 gitignore，日志不会进仓库。日志里能看到 `GET /admin 200 in 137ms` 这种行——**App 发的请求和浏览器发的长得一样**，靠时间戳对齐即可。

> ⚠️ 改 `next.config.ts`（例如 `allowedDevOrigins`）**必须完全重启 dev server**才生效；日志里出现 `✓ Running next.config.ts took Nms` 才算读到了配置。

## 3. adb logcat 判据表（本项目的真实特征串）

```powershell
$adb='D:\AndroidSDK\platform-tools\adb.exe'
& $adb logcat -c ; & $adb logcat -d > $env:TEMP\gv.txt
```

| logcat 里出现 | 含义 |
|---|---|
| `Download the React DevTools for a better development experience` | ★ **React 真的启动了**。hydrate 是否发生，看这一条最准 |
| `[HMR] connected` | dev 客户端与 Next 的 HMR websocket 连通（没连上时它会每 2 秒重试一次） |
| `handleMessage GeckoView:LocationChange uri=...` | 导航序列。**这是判断"点击是否真生效"的硬证据** |
| `uri=.../admin/login?username=admin&password=admin123456` | ❌ **原生 GET 表单提交** —— `onSubmit` 从未绑定 ⇒ 页面**没 hydrate**。看到这个不要再查 App 的点击/触摸逻辑，方向全错 |
| `[JavaScript Error: "..."]` | 页面 JS 报错（带 file/line 的比不带的更好定位） |
| `GeckoConsole:` | Gecko 自身（`MOZ_LOG`）输出，不是页面 console |
| `F libc: Fatal signal 4 (SIGILL)` + `DEBUG: ABI:` | ABI 不匹配（见 build.md §3） |

## 4. 截图必须二进制安全

```powershell
# ✅ 用 python 落盘（PowerShell 的 > 重定向会做 CRLF 转换，把 PNG 弄坏）
python -c "import subprocess; open(r'$env:TEMP\gv.png','wb').write(subprocess.run([r'D:\AndroidSDK\platform-tools\adb.exe','exec-out','screencap','-p'],capture_output=True).stdout)"
```

## 5. 页面 `console.*` 进 logcat

`MainActivity` 里对 **debug 构建**开了 `.consoleOutput(BuildConfig.DEBUG)`，等价于 Gecko 的 `devtools.console.stdout.content`。

⚠️ 但它**不是万能的**：Next 的 dev 客户端会把页面 `console.*` 劫持进一个队列（`_forwardlogs.logQueue`），**等 HMR socket 连通才转发**。socket 不通时页面 console **一条都不落 logcat**——这时别误判成"JS 没跑"，要结合 §3 的 `LocationChange` 与请求日志判断。

## 6. 已知坑（症状 → 根因）

| 症状 | 根因 | 详见 |
|---|---|---|
| 登录按钮"点了没反应"（实际是原生 GET 提交）+ 首页背景图不显示 | 宿主地址不在 `allowedDevOrigins` → HMR ws 被 403 → dev 客户端降级 → **页面根本没 hydrate** | [docs/pitfalls.md](../pitfalls.md) **P-110** |
| **点上传没反应**（系统选择器不弹、页面一直等） | 宿主没实现 `PromptDelegate.onFilePrompt` | [architecture.md](architecture.md) §6b |
| 选择器弹了、文件也选中了，**页面仍显示「未选择」** | `content://` 没转 `file://`（Gecko 内容进程拿不到 App 的 URI 授权，报 `NS_ERROR_FILE_UNRECOGNIZED_PATH`） | [architecture.md](architecture.md) §6b |
| 点了「确认」后页面一片白，但 dev server 有 `GET / 200`、React 也启动了 | 视图可见性在 `GeckoView` **创建之前**被设置 → 视图停在 `GONE`（页面其实加载好了） | [architecture.md](architecture.md) §7 |
| 装了 app 一启动就退出 | ABI 与设备不匹配（SIGILL） | build.md §3 |
| 页面能看但样式全丢 | 设备内核过老（Tailwind 4 需要 Chrome 111；`@layer` 需 Chrome 99） | `main/public/_probe.html` 体检 |
