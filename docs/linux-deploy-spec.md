# Spec：Linux 精简安装与版本升级

- 日期：2026-09-04
- 提案人：AI
- 状态：已批准（用户要部署且不要每版改脚本）/ 实施中

### 1. 目标

空 Linux 机只上传程序更新包（约 1MB 级），本地执行一次 `scripts/install.sh` 完成首装。之后每个版本只换新的 `tar.gz`，走后台「更新」或 `pnpm apply-update --file`，**不改安装脚本**。

### 2. 设计方案

- 发布物 = 现有 `pnpm pack:update` 包（已含 `scripts/install.sh` 与 `INSTALL.md`）
- 首装：解压 → `bash scripts/install.sh` → 打开站点走创建页或 `pnpm setup` → pm2
- 升级：导入包 → 预约立刻重启 → `boot.cjs` 覆盖。CLI `--file` 只入库+预约，覆盖仍在下次启动
- 禁止把 Windows 的 `node_modules` / `.next` 传到 Linux

### 3. 影响面

- 新文件：`scripts/install.sh`、`INSTALL.md`、本 Spec
- `lib/update/paths.ts` 用拒绝名单，不再维护允许的根文件清单
- `apply-update --file` 复用 `stageAndQueueUpdate`
- 无新 npm 依赖、无 Setting KV

### 4. 验收

- 发新版本不必改 `install.sh`
- 只 scp 更新包即可升级
- 文章与 `.env` 不被覆盖

### 5. 生产机实际布局（2026-10-02 迁移后的事实源）

| 项 | 值 |
|---|---|
| 程序目录 | **`/opt/myblog`**（**不是 `/root`**，见 P-115 与 P-133） |
| 数据库 | `/opt/myblog/data/blog.db`（schema 里是 `file:../data/blog.db`，**相对 `prisma/` 目录解析**） |
| 媒体 | `/opt/myblog/data/uploads/`（另有 `backups/`、`updates/`、`backup-host-secret.json`、`backup-manifests.json`） |
| 进程 | pm2 `myblog`：`ecosystem.config.cjs` 里 `cwd: __dirname`、**直接起 `node_modules/next/dist/bin/next start`**（不经 `scripts/boot.cjs`） |
| 入口 | nginx `sites-enabled/myblog` → `proxy_pass http://127.0.0.1:3000`（`bruccese.com`；`www` 301 到主域） |
| pm2 home | `/var/lib/pm2`（**不是** `$HOME/.pm2`，所以 socket 不落在项目里） |

#### 5.1 版本更新（本地打包 → scp → 服务器应用）

**本地 Windows PowerShell**：

```powershell
cd D:\code_projects\myblog\main

# 可选但推荐：先跑测试，避免把红着的包发上去
pnpm test

# 产出 main/data/updates/myblog-update-<时间戳>.tar.gz
pnpm pack:update

# 取最新包并上传（把 <host> 换成服务器地址）
$pkg = Get-ChildItem .\data\updates\myblog-update-*.tar.gz |
  Sort-Object LastWriteTime |
  Select-Object -Last 1
scp $pkg.FullName root@<host>:/opt/myblog/data/updates/
```

**服务器**（完整顺序；**先停 pm2 再备份和迁移**）：

```bash
ssh root@<host>
cd /opt/myblog

# 1) 先停服务，避免 SQLite 迁移撞上正在运行的应用
pm2 stop myblog

# 2) 停机后备份库（此时没有写入，cp 才是安全的）
mkdir -p data/backups
cp -a data/blog.db "data/backups/blog.db.$(date +%Y%m%d-%H%M%S).bak"

# 3) 取本次刚上传的最新包
PKG=$(ls -t data/updates/myblog-update-*.tar.gz | head -n 1)
echo "apply: $PKG"

# 4) 入库 + 预约（只登记，不覆盖程序）
pnpm apply-update --file "$PKG"

# 5) 真正应用：覆盖 → install（依赖变了才跑）→ migrate deploy → prisma generate → next build
pnpm apply-update --pending --start

# 6) 启动并验收
pm2 start myblog
pm2 status myblog
curl -fsS -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:3000/
curl -fsS -o /dev/null -w "public=%{http_code}\n" https://bruccese.com/
pm2 logs myblog --lines 80 --nostream
```

**必须停 pm2 再 `--pending`**：`prisma migrate deploy` 会撞上正在运行的应用持有的 SQLite 连接，实测报 `database is locked`。停机窗口约 2–3 分钟（构建占大头）。

**失败时**：`apply-update --pending --start` 会把旧 `.next` 备份到 `.next.bak`，构建失败会自动恢复构建产物；先看 `pm2 logs myblog` 和 `data/update-state.json`，不要连续重复 `--pending`。**不要只 `mv .next.bak .next` 就当成完整回滚**——源码已经是新版本，单回滚构建产物不保证兼容；要完整回滚，用上一版完整 tar.gz 再走一遍 `--file` → `--pending --start`。

> 只有绕过更新流程、手工跑 `pnpm prisma migrate deploy` 时，才需要补 `pnpm prisma generate` 再 `pnpm build`；走上面 `apply-update` 不需要手工补，顺序已经内含。

#### 5.2 迁移到新目录（一次性，2026-10-02 执行过）

`/root` → `/opt/myblog` 的完整步骤（含踩过的坑）：

1. **一致性快照**库：`node -e "...db.backup('/opt/myblog/data/blog.db')"`（better-sqlite3 的 `.backup()`，**禁止直接 cp** 正在写的库，见 P-011）
2. `pm2 stop myblog`；`cp -a src prisma public scripts package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.ts next-env.d.ts postcss.config.mjs eslint.config.mjs .npmrc .env .env.example INSTALL.md /opt/myblog/`；数据带 `data/{uploads,backups,updates,backup-host-secret.json,backup-manifests.json}`
3. **`node_modules` 必须重装，不能 `cp -a`**：pnpm 的 `.bin` 与包内软链指向**绝对路径**，拷过去就是一堆断链 → 目标目录 `rm -rf node_modules .next && pnpm install --frozen-lockfile`（有本地 store 时 8.6 秒、无需联网）
4. `.next` 里嵌了旧的绝对路径 → 在目标目录重新 `next build`
5. `ecosystem.config.cjs` 用 `cwd: __dirname`；在 `/opt/myblog` 下 `pm2 delete myblog && pm2 start ecosystem.config.cjs && pm2 save`
6. 验收：本地 8 条路由 + `curl --resolve bruccese.com:443:127.0.0.1 https://bruccese.com/`（`ssl_verify_result=0`）+ 库行数比对（Post/Moment/Comment/Upload/AdminUser/Setting）
7. 旧目录：整包留档到 `/var/backups/myblog/root-before-migration-<时间戳>.tar.gz` 后再删。**别把快照放在项目根**（见 P-134）

### 6. 相关陷阱

- **P-115**：程序别装在 `$HOME`（pm2 socket 落进项目、Turbopack 读 socket 崩）
- **P-133**：`data/update-pending.json` 是**每次启动都会重试**的开关；失败只写 `update-state.json`、不清 pending → pm2 每次拉起都白跑一次全量构建（还要停 pm2 再应用，否则迁移撞锁）
- **P-134**：覆盖前快照**不能放在项目根**，会被 `tsconfig` 的 `**/*.ts` 扫进去做类型检查，构建直接失败
