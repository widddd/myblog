# 安装与升级

程序包是一份小的 `tar.gz`（`pnpm pack:update`），不含 `node_modules`、`.next`、`data/`。不要把 Windows 整仓或 `node_modules` 拷到 Linux。

安装脚本只在**第一次**空机使用。之后每个版本只换新的更新包，**不要改 `scripts/install.sh`**。

## 第一次安装（Linux）

机器上需要：Node.js ≥22、pnpm 11（可用 corepack）、python3 / make / g++（sharp 与 better-sqlite3 原生模块）、nginx、pm2。1GB 内存请先加 1～2GB swap。

```bash
mkdir -p /opt/myblog && cd /opt/myblog
tar xzf /tmp/myblog-update-YYYYMMDD-HHMMSS.tar.gz
bash scripts/install.sh
# 然后打开站点 /admin/setup 创建，或 pnpm setup
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

nginx 反代 `127.0.0.1:3000`，并设置：

```nginx
client_max_body_size 512m;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

不要跑 `pnpm db:seed`（那是开发演示数据）。COS 和站点地址在创建页或后台「设置」里填。站长注意见仓库 [docs/user-manual.md](../docs/user-manual.md)。

## 以后每个版本怎么升

在 Windows 开发机：

```powershell
cd main
pnpm pack:update
pnpm pack:update --git v0.1.0
```

把打出来的 `data/updates/myblog-update-*.tar.gz` 拷到能访问后台的电脑，或 scp 到服务器。然后：

1. **推荐**：登录 `/admin/updates` → 导入更新包 → 应用 → 立刻重启（Halo 式：只换包，不改脚本）
2. **SSH**：`pnpm apply-update --file ./myblog-update-xxx.tar.gz` 然后 `pm2 restart myblog`

重启后 `boot.cjs` 会覆盖程序文件；依赖有变会安装；会跑迁移；生产会重新 `next build`。文章、图片、`.env` 不动。

## 不要做

- 每个改动去改安装脚本或环境变量模板
- 上传 Windows 的 `node_modules` / `.next`
- 在正在开发的那份目录上点「立刻重启并更新」
