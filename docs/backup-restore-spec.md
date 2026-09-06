# Spec：一键恢复备份

- 日期：2026-08-30
- 提案人：AI
- 状态：已批准（用户要求增加脚本或按钮）/ 已实施

### 1. 目标

把 README 里「停服后手动解包覆盖」收成两条可点的路，避免漏删 WAL、漏覆盖 uploads、路径写错。

### 2. 设计方案

在线覆盖正在被 Prisma 打开的 `blog.db` 会锁文件或读到旧 fd，因此**不在运行中的请求里真正换库**。

| 入口 | 做法 |
|---|---|
| 后台「恢复」 | 先 `runBackup()` 留一份当前数据 → 写 `data/restore-pending.json`（`restartAt` 可空）。站点继续运行。用户设定重启时间或点「立刻重启」后才退出进程。pm2/systemd 只退出由守护拉起；否则直接拉 `next`（不经 pnpm，避免 Windows 弹出 cmd）。`instrumentation.ts` 仅在 `restartAt` 已到期时覆盖 |
| `pnpm restore` | 进程已停时当场解包覆盖；`--pending` 只写预约文件 |

新备份先打内层 tar.gz，再以拆分密钥合成的 DEK 做 AES-256-GCM，外层放入 `meta.json` + `half` + `payload.enc`。恢复先合成 DEK、校验哈希、解密，再按内层规则解包。详见 [backup-encryption-spec.md](backup-encryption-spec.md)。

解包：纯 JS 读本项目 archiver 打的 tar.gz，**不调用系统 tar**。只收 `blog.db` 与 `uploads/<合法 Storage key>`，拒绝 `..` / 绝对路径 / 符号链接。上传文件只经 `StorageDriver.delete` + `put`（`put` 遇已存在会跳过，必须先删）。换库用快照文件覆盖，并删 `-wal`/`-shm`。CLI 换库前对当前库走 better-sqlite3 `.backup()` 写成 `blog.db.before-restore`。

复用：`isBackupFileName`、`listBackups`、`runBackup`、`getDriver("local")`、`requireAdmin` + CSRF。无新 npm 依赖。

### 3. 影响面分析

- 涉及模块：`lib/db-path.ts`（从 `db.ts` 抽出，恢复链路不得 import Prisma）、`lib/backup/*`、`instrumentation.ts`、后台 backups 页、`scripts/restore-backup.ts`
- 新增/变更配置字段：无
- 是否破坏红线：否。文件名白名单；uploads 走 StorageDriver；恢复不在 Prisma 连库时覆盖；不用系统 tar
- 是否新增依赖：无

### 4. 输入输出边界

- `POST /api/admin/backup/restore` `{name, confirm:true}` → 只预约，不重启
- `PUT /api/admin/backup/restore` `{restartNow:true}` 或 `{restartAt:ISO}`
- `POST /api/admin/backup/restore/upload` multipart `.tar.gz`（明文或加密）→ 加入列表，不立刻预约
- `PUT /api/admin/backup/encrypt` `{enabled}` 手设加密开关
- `GET /api/admin/backup/list` 每条标明时间、大小、版本、是否加密、`local`/`cos`
- `DELETE /api/admin/backup/restore` → `{data:{ok:true}}`
- `POST /api/admin/backup/pull` `{name}` 把仅在 COS 的包拉回本地后再走现有预约恢复
- `pnpm restore [--file name\|--latest] [--yes] [--pending] [--passphrase]`

### 5. 实施步骤

1. 抽出 prisma-free 路径与列表
2. 解包白名单 + 恢复核心 + 单测
3. 预约 API、启动钩子、后台按钮、CLI
4. 文档同步

### 6. 验收标准

- 用本项目打的 tar.gz 能解出 `blog.db` 与 uploads；含 `../` 的条目被拒绝
- 后台点恢复后站点继续可用；设定重启时间到期或点「立刻重启」后才覆盖。未到点的启动不会覆盖
- 应用仍在跑时 `pnpm restore --yes` 换库失败并提示先停进程
- 预约恢复的备份不能直接删除（须先取消预约）
- 已预约程序更新时不能再预约恢复（反之亦然）；更新覆盖的是程序文件，不是 `blog.db`

### 7. 审批

- [x] 用户已要求增加一键恢复脚本或按钮
- [x] 实施完成
- [x] 文档已同步（见交付回复）
