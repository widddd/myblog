# Spec：程序更新（导入博客文件自动更新）

- 日期：2026-09-04
- 提案人：AI
- 状态：已批准 / 0.1 起用拒绝名单打包、git 导出与后台 GitHub 检查

### 1. 目标

把「拿到一份新的博客程序文件，换到正在跑的站点上」收成后台可点的路：导入更新包 → 预约 → 重启后自动覆盖程序文件、装依赖、跑迁移、生产环境再构建。站点数据（`data/`、`.env`、备份密钥）一律不动。

### 2. 设计方案

更新包是明文 `tar.gz`（复用 archiver + 现有纯 JS 解 tar），**拒绝** `data/`、`.env*`、`node_modules/`、`.next/`、`.git/`、`coverage/`、测试文件与路径穿越。`main/` 下其余文件（含以后新增的顶层目录）都会进包。与备份包分开：备份管文章/图片/设置，更新管程序本身。

| 入口 | 做法 |
|---|---|
| 后台「更新」 | 上传或当场打包 → 点「应用」只写 `data/update-pending.json`。到点或「立刻重启」后退出进程。下一次启动由 `scripts/boot.cjs` **在拉起 Next 之前**覆盖文件 |
| `pnpm pack:update` | 从当前 `main/` 或 `--git <ref>`（`git archive <ref>:main`）打一份更新包到 `data/updates/` |
| `pnpm apply-update --file` | 把一份 tar.gz 入库并预约立刻重启；再 `pm2 restart`。不改任何脚本 |
| `pnpm apply-update --pending` | 给 boot 调用；进程已停时也可手动跑 |

启动统一走 `boot.cjs`（`pnpm dev` / `pnpm start` / pm2 / 无监护 relaunch 都一样）：先应用到期更新，再 `require` Next CLI，保持同一 PID，便于 pm2 内存线盯住真正的 Node 进程。

覆盖前若 `package.json` / `pnpm-lock.yaml` 有变则 `pnpm install --frozen-lockfile`；始终尝试 `prisma migrate deploy`；仅生产 `start` 才 `next build`（先把旧 `.next` 拷到 `.next.bak`，失败则拷回）。开发 `dev` 不构建。

与预约恢复互斥：两边不能同时挂预约。

复用：`walkTarGz`、`scheduleAppRestart` / relaunch、`requireAdmin` + CSRF、archiver。无新 npm 依赖。

### 3. 影响面分析

- 涉及模块：新建 `lib/update/*`；`lib/backup/tar.ts` 导出通用解包遍历；`lib/backup/restart.ts` 增加通用重启别名；`scripts/boot.cjs`；后台 `/admin/updates`；`ecosystem.config.cjs` 与 `package.json` 脚本
- 新增/变更配置字段：Setting `updateGithubRepo`（默认空；读写 + WRITABLE_SETTING_KEYS + 设置表单）
- 是否破坏红线：否。拒绝名单打包；不碰 `data/` 与 `.env`；SQLite 仍单实例；不引入重依赖；1GB 下构建用 `--max-old-space-size=768`
- 是否新增依赖：无（tsx / prisma CLI 沿用现有，与 `pnpm restore` / `pnpm setup` 相同）

### 4. 输入输出边界

更新包 `meta.json`：`{ kind:"app-update", schema:1, channel, version, label, createdAt }`。

- `GET /api/admin/update` → 当前版本、包列表、预约、上次结果
- `POST /api/admin/update/upload` multipart `.tar.gz` → 入库，不立刻应用
- `POST /api/admin/update/pack` → 把当前程序打成包并入库
- `GET /api/admin/update/download/[file]` → 下载
- `DELETE /api/admin/update/[file]` → 删除包（已预约的 409）
- `POST /api/admin/update/apply` `{name, confirm:true}` → 只预约
- `PUT /api/admin/update/apply` `{restartNow:true}` 或 `{restartAt:ISO}`
- `DELETE /api/admin/update/apply` → 取消预约
- `pnpm pack:update [--out path] [--git ref]`
- `GET/POST /api/admin/update/github`
- `pnpm apply-update --file path`（入库+预约立刻重启）
- `pnpm apply-update --pending`

### 5. 实施步骤

1. 抽出 `walkTarGz`、通用重启、`boot.cjs`
2. 打包/解包/覆盖/预约 + 单测
3. API、后台页、启动脚本
4. 文档同步

### 6. 验收标准

- 用本仓库打的更新包能解出 `meta.json` 与 `src/` 等程序文件；根上新文件与新目录能进包；含 `data/`、`.env`、`..` 的条目被拒绝
- 后台点应用后站点继续可用；到点或立刻重启后才覆盖程序文件
- 覆盖后 `data/blog.db` 与 `.env` 仍在
- 已预约恢复时不能再预约更新（反之亦然）
- 生产路径会尝试 `migrate deploy` 与 `next build`；开发路径不构建

### 7. 审批

- [x] 用户已要求规划并执行到完成
- [ ] 实施完成（文档、boot 启动、后台打包已验收；未在开发目录应用更新；副本整包冒烟未做）
- [x] 文档已同步
