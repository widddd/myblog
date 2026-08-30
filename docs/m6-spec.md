# Spec：M6 备份系统

- 日期：2026-08-29
- 提案人：AI
- 状态：已实施（用户本会话要求完成 M6，并同期改首页透明度与后台写文章布局）

### 1. 目标

完成 PLAN.md M6：better-sqlite3 `.backup()` 快照 + archiver 打 tar.gz + 滚动保留 + 进程内互斥锁 + 后台管理页；scheduler 启动补偿与每小时到期检查。

同期体验：首页半透明幕布更透、去掉欢迎卡内的横向白缝；后台栏目改左侧竖栏；写文章页左侧设置 / 右侧编辑器，均可收起并带 CSS 动画。

**本里程碑不做**：OssDriver 实装、备份上传 OSS、自动恢复（恢复由管理员停服后手动解包）、重量级动画库。

### 2. 设计方案

| 项 | 做法 |
|---|---|
| 快照 | `getSqliteHandle().backup(temp/blog.db)`，禁止拷贝 `blog.db` / WAL 文件 |
| 打包 | `archiver('tar', { gzip: true })`；包内 `blog.db` + `uploads/<posix-key>` |
| 上传文件 | 只经 `StorageDriver.listKeys()` / `openReadStream()`，不直接拼 `data/uploads` |
| 落盘 | `main/data/backups/myblog-YYYYMMDD-HHMMSS.tar.gz`；先写 `.tmp-*` 再 rename |
| 滚动 | `backupKeep`（默认 5）；按文件名新→旧切 slice |
| 互斥 | `globalThis.myblogBackupRunning`；冲突 409 |
| 周期 | `lastBackupAt + backupPeriodDays`（默认 3 天）；启动检查 + 3600s interval |
| 管理 API | `POST /run` 同步执行；`GET /list`；`GET /download/[file]`；`DELETE /[file]` |
| 文件名 | 白名单 `^myblog-\d{8}-\d{6}\.tar\.gz$` + `path.resolve` 仍须落在 backups 目录内 |

复用：`requireAdmin`、CSRF、`getSetting`/`setSetting`（`lastBackupAt` 只由备份写入）、`AdminHttpError`、已有 `archiver` 依赖。无新 npm 依赖。

### 3. 影响面分析

- **涉及模块**：`lib/backup/*`、`lib/scheduler/backup.ts`、`lib/storage`（补 listKeys/openReadStream）、后台 backups 页、AdminWorkspace/写文章布局、首页 Banner CSS
- **新增/变更配置字段**：无新 Setting key；`backupPeriodDays` / `backupKeep` / `lastBackupAt` 沿用 M1 默认值
- **是否破坏红线**：否。备份走 `.backup()`；uploads 走 StorageDriver；无 Redis；archiver 已在 package.json
- **是否新增依赖**：无

### 4. 输入输出边界

- `POST /api/admin/backup/run` → `{ data: { name, size, createdAt } }`；忙 409
- `GET /api/admin/backup/list` → `{ data: { files, running, lastBackupAt } }`
- `GET /api/admin/backup/download/[file]`：附件流；非法名 400；缺失 404
- `DELETE /api/admin/backup/[file]`：`{ data: { ok: true } }`

### 5. 实施步骤

1. StorageDriver 补 listKeys / openReadStream
2. backup 核心 + 文件名白名单单测
3. 四条 API + 后台页 + scheduler 注入
4. 首页透明度 / 欢迎卡接缝；后台竖栏与写文章分栏
5. 文档同步 + Windows 上 test/lint/dev 验证

### 6. 验收标准

- 手动备份生成 `data/backups/myblog-*.tar.gz`，解包可见 `blog.db` 与 `uploads/`
- 非法文件名（`../`、错误后缀）下载/删除 400
- 设置周期后，`lastBackupAt` 过期会在启动或下一小时检查时再备一份
- 超过 `backupKeep` 的旧包被删
- 首页下滚能看清底图；欢迎卡内无横向白缝
- 写文章页左侧设置、右侧编辑器；两侧可收起

### 7. 审批

- [x] 用户已要求完成 M6 与上述 UI 修改
- [x] 实施完成
- [x] 文档已同步（见交付回复）
