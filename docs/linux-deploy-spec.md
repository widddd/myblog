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
