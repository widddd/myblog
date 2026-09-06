# Spec：拆分密钥备份与投产初始化

- 日期：2026-08-30
- 提案人：AI
- 状态：已批准（用户要求只拿 tar.gz 不能解密；口令只初始化一次且不可改；管理员账号与备份口令都不写死）

### 1. 目标

- 只拿走 `myblog-*.tar.gz` **不能**解密。完整数据密钥 `DEK` 必须由两半拼出
- **主机半钥**固定：初始化口令经 scrypt 派生，只存在本机，不进备份包
- **包内半钥**每份不同：`randomBytes(32)`，只放在该份备份里
- 口令设定后不可更改（没有后台/API/`--force`）
- 投产时站点名称、管理员用户名、密码和备份口令走创建站点页或 `pnpm setup` 手动输入，代码里不出现默认账号、默认口令或默认站名 MyBlog

### 2. 设计方案

| 项 | 做法 |
|---|---|
| 派生 | Node `crypto.scrypt`，`N=16384, r=8, p=1`（约 16MB），盐随机 16 字节。不新增 npm 包 |
| 合成 | `DEK = hostHalf XOR packageHalf`（各 32 字节） |
| 内容加密 | AES-256-GCM；`payload.enc` 头为 `MBENC02\n` + IV(12) + tag(16) + ciphertext |
| 外层包 v2 | `meta.json` `{v:2,kdf:"scrypt",salt,n,r,p}` + `half` + `payload.enc`。**没有**明文完整钥匙 |
| 主机半钥文件 | `data/backup-host-secret.json`（gitignore；禁止打进备份）：`{salt,hostHalf,n,r,p}` |
| 后台 | 表 `BackupSecret` 只存 `SHA-256(DEK)`，不存半钥、不存口令 |
| 本机恢复 | 读主机半钥文件 + 包内 `half` 合成 DEK；后台须 `requireAdmin` 后再对哈希 |
| 换机恢复 | `pnpm restore --passphrase`：用包内盐再派生主机半钥 |
| 口令 | 后台「备份」页交互设定一次（`POST /api/admin/backup/passphrase`）；`pnpm setup` 也可在文件不存在时写一次。已存在则拒绝，没有改口令入口。加密可随时开关；不设口令仍可做非加密备份 |
| 旧包 v1 | 仍含明文 `key` 的包只读解密；只拿文件仍能解开。新备份一律 v2 |
| 管理员 | 创建站点页或 `pnpm setup` 手设用户名/密码，`mustChangeCredentials=false`。无管理员时打开站点引导 `/admin/setup` |

只拿文件解不开：攻击者有 `half` + `salt` + 密文，没有口令得不到主机半钥，XOR 不出 DEK。撞 scrypt 的成本由参数兜住。

主机半钥文件与 `data/backups/` 分开保管；整目录拷走才等于两半都丢了。文件丢了且口令也忘了：旧包无法在新机器解开。本机文件还在则可一键恢复。

复用：`lib/backup/*`、`requireAdmin`、iron-session。路径用 `node:path`，半钥文件不走 StorageDriver。

### 3. 影响面分析

- 涉及模块：`lib/backup/host-secret.ts` `crypto.ts` `container.ts` `backup.ts` `restore.ts` `secrets.ts`、`scripts/init-production.ts`、后台恢复 API / CLI、`bootstrap.ts`
- 新增配置字段：无 Setting KV；半钥不进数据库
- 是否破坏红线：否。哈希用 Prisma；CLI 只读哈希时用参数化 better-sqlite3；uploads 仍走 StorageDriver；备份仍用 `.backup()`
- 是否新增依赖：无

### 4. 输入输出边界

- 新备份外层条目：`meta.json`、`half`、`payload.enc`
- 无主机半钥时 `runBackup()` 在加密开启时拒绝并中文报错；加密关闭时打明文包，禁止静默生成弱密钥
- 加密包落盘后若 COS 已配齐则 `putFile` 到 `backups/`（私有）；失败记日志、不回滚本地。明文包同样可上云（P-041 已改为加密可开关）
- `POST /api/admin/backup/restore` 用本机半钥合成 DEK 再对哈希；无半钥文件 409 `HOST_SECRET_MISSING`
- `POST /api/admin/backup/passphrase`：已登录管理员在后台设一次口令；已存在 409
- `pnpm setup`：也可手设管理员与备份口令；半钥已存在则不可改口令
- `pnpm restore --passphrase`：换机用包内盐派生

### 5. 验收标准

- 新备份去掉主机半钥后无法解密；错口令 GCM 失败
- 同一口令 + 同一盐可重建主机半钥
- 包内半钥或主机半钥单独都得不到 DEK
- 后台未登录不能恢复；DEK 哈希不一致时拒绝
- 无管理员时必须走创建页或 `pnpm setup`，不能靠代码里的默认账号进后台
- v1 旧包仍可只读恢复（并在文档标明「只拿文件就能解」）
- 非加密备份与加密备份走同一套落盘/列表/COS/恢复；COS HTTPS 且用户未手设时默认关加密；「上传备份」加入列表；点恢复只预约，到点或立刻重启才覆盖
